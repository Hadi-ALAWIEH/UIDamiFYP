import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { createDonationPost, deleteDonationPost, getMyDonationPosts } from "../api/donationPosts";
import { DonationPostStatus } from "../types";
import { BLOOD_TYPE_OPTIONS, bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import type { DonationPostCandidateViewModel } from "../types";

// ── Leaflet icon fix ───────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl:       markerIcon,
    shadowUrl:     markerShadow,
});

const DEFAULT_CENTER: [number, number] = [33.8938, 35.5018];

type LocationStatus = "idle" | "requesting" | "set" | "denied" | "error";
type SearchResult   = { display_name: string; lat: string; lon: string };

// ── SVG illustration ───────────────────────────────────────────────────────
function PostsIllustration() {
    return (
        <svg width="118" height="118" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Main blood drop */}
            <path d="M60 14 C60 14 30 52 30 70 C30 87 44 98 60 98 C76 98 90 87 90 70 C90 52 60 14 60 14Z"
                fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
            {/* Medical cross */}
            <rect x="54" y="55" width="12" height="32" rx="2.5" fill="rgba(255,255,255,0.85)"/>
            <rect x="46" y="63" width="28" height="12" rx="2.5" fill="rgba(255,255,255,0.85)"/>
            {/* Location pin stem */}
            <line x1="60" y1="98" x2="60" y2="108" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
            <circle cx="60" cy="110" r="3.5" fill="rgba(255,255,255,0.45)"/>
            {/* Satellite drops */}
            <path d="M20 32 C20 32 15 40 15 43 C15 46.5 17 48 20 48 C23 48 25 46 25 43 C25 40 20 32 20 32Z"
                fill="rgba(255,255,255,0.28)"/>
            <path d="M100 44 C100 44 95 52 95 55 C95 58.5 97 60 100 60 C103 60 105 58 105 55 C105 52 100 44 100 44Z"
                fill="rgba(255,255,255,0.22)"/>
            {/* Sparkle circles */}
            <circle cx="16" cy="64" r="3.5" fill="rgba(255,255,255,0.38)"/>
            <circle cx="104" cy="70" r="2.5" fill="rgba(255,255,255,0.32)"/>
            <circle cx="28" cy="94" r="3"   fill="rgba(255,255,255,0.28)"/>
            {/* Heartbeat */}
            <polyline points="4,76 16,76 22,64 28,84 34,72 40,76 52,76"
                stroke="rgba(255,255,255,0.52)" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
    );
}

// Draggable/clickable pin used in the creation form.
function LocationMarker({
    position,
    onPick,
}: {
    position: [number, number];
    onPick: (lat: number, lng: number) => void;
}) {
    useMapEvents({
        click(e) { onPick(e.latlng.lat, e.latlng.lng); },
    });
    return (
        <Marker
            position={position}
            draggable
            eventHandlers={{
                dragend: (e) => {
                    const marker = e.target as L.Marker;
                    const pos = marker.getLatLng();
                    onPick(pos.lat, pos.lng);
                },
            }}
        />
    );
}

// Read-only map on each post card.
function PostMiniMap({ lat, lng }: { lat: number; lng: number }) {
    const pos: [number, number] = [lat, lng];
    return (
        <MapContainer
            center={pos}
            zoom={14}
            style={{ height: 190, width: "100%" }}
            dragging={false}
            zoomControl={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            attributionControl={false}
        >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={pos} />
        </MapContainer>
    );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyPosts() {
    const [posts,        setPosts]        = useState<DonationPostCandidateViewModel[]>([]);
    const [postsLoading, setPostsLoading] = useState(true);
    const [postsError,   setPostsError]   = useState<string | null>(null);
    const [deleting,     setDeleting]     = useState<number | null>(null);
    const [showForm,     setShowForm]     = useState(false);
    const [submitting,   setSubmitting]   = useState(false);
    const [formError,    setFormError]    = useState<string | null>(null);
    const [successMsg,   setSuccessMsg]   = useState<string | null>(null);

    const [bloodType, setBloodType] = useState(0);
    const [quantity,  setQuantity]  = useState(1);
    const [address,   setAddress]   = useState("");

    const [latitude,       setLatitude]       = useState<number | undefined>();
    const [longitude,      setLongitude]      = useState<number | undefined>();
    const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
    const [showMap,        setShowMap]        = useState(false);
    const [isMaximized,    setIsMaximized]    = useState(false);
    const [searchQuery,    setSearchQuery]    = useState("");
    const [searchResults,  setSearchResults]  = useState<SearchResult[]>([]);
    const [searching,      setSearching]      = useState(false);
    const [searchError,    setSearchError]    = useState<string | null>(null);

    const mapRef = useRef<L.Map | null>(null);

    const markerPosition = useMemo<[number, number]>(
        () => [latitude ?? DEFAULT_CENTER[0], longitude ?? DEFAULT_CENTER[1]],
        [latitude, longitude]
    );

    useEffect(() => {
        if (!showMap) return;
        const id = window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
        return () => window.clearTimeout(id);
    }, [isMaximized, showMap]);

    useEffect(() => {
        if (!isMaximized) return;
        function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setIsMaximized(false); }
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [isMaximized]);

    function applyPosition(lat: number, lng: number, opts?: { pan?: boolean }) {
        setLatitude(lat);
        setLongitude(lng);
        setLocationStatus("set");
        if (opts?.pan) mapRef.current?.setView([lat, lng], 15);
    }

    function handleUseCurrentLocation() {
        if (!("geolocation" in navigator)) { setLocationStatus("error"); setShowMap(true); return; }
        setLocationStatus("requesting");
        navigator.geolocation.getCurrentPosition(
            (pos) => { applyPosition(pos.coords.latitude, pos.coords.longitude, { pan: true }); setShowMap(true); },
            ()    => { setLocationStatus("denied"); setShowMap(true); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    function handleChooseOnMap() { setShowMap(true); }

    function handleClearLocation() {
        setLatitude(undefined);
        setLongitude(undefined);
        setLocationStatus("idle");
        setShowMap(false);
        setIsMaximized(false);
        setSearchQuery("");
        setSearchResults([]);
        setSearchError(null);
    }

    async function handleSearch(e?: FormEvent) {
        e?.preventDefault();
        const q = searchQuery.trim();
        if (!q) return;
        setSearching(true);
        setSearchError(null);
        setSearchResults([]);
        try {
            const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`);
            if (!res.ok) throw new Error("Search request failed");
            const data = (await res.json()) as SearchResult[];
            setSearchResults(data);
            if (data.length === 0) setSearchError("No matching places found.");
        } catch {
            setSearchError("Couldn't reach the location search service. Try again.");
        } finally {
            setSearching(false);
        }
    }

    function handleSelectResult(result: SearchResult) {
        applyPosition(parseFloat(result.lat), parseFloat(result.lon), { pan: true });
        setSearchResults([]);
        setSearchQuery(result.display_name);
    }

    function resetForm() {
        setBloodType(0);
        setQuantity(1);
        setAddress("");
        handleClearLocation();
        setFormError(null);
    }

    function loadPosts() {
        setPostsLoading(true);
        setPostsError(null);
        getMyDonationPosts()
            .then(setPosts)
            .catch(err => setPostsError(err instanceof Error ? err.message : "Failed to load posts."))
            .finally(() => setPostsLoading(false));
    }

    useEffect(loadPosts, []);

    async function handleDelete(id: number) {
        if (!window.confirm("Delete this donation post? This cannot be undone.")) return;
        setDeleting(id);
        try {
            await deleteDonationPost(id);
            loadPosts();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete post.");
        } finally {
            setDeleting(null);
        }
    }

    async function handleCreate() {
        if (quantity < 1) { setFormError("Quantity must be at least 1."); return; }
        setFormError(null);
        setSuccessMsg(null);
        setSubmitting(true);
        try {
            await createDonationPost({
                bloodTypeName: bloodType,
                quantity,
                address:   address || undefined,
                latitude,
                longitude,
            });
            setSuccessMsg("Your donation post was created successfully!");
            setShowForm(false);
            resetForm();
            loadPosts();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to create post.");
        } finally {
            setSubmitting(false);
        }
    }

    const postsWithLocation = posts.filter(p => p.latitude != null && p.longitude != null).length;

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <AppLayout>

            {/* ── Banner ── */}
            <div style={st.pageBanner}>
                <div style={st.bannerDecor1} />
                <div style={st.bannerDecor2} />

                <div style={st.bannerLeft}>
                    <h2 style={st.bannerTitle}>My Donation Posts</h2>
                    <p style={st.bannerSubtitle}>Signal your blood availability so seekers can find you</p>
                    <div style={st.bannerStats}>
                        <span style={st.bannerStatPill}>{posts.length} post{posts.length !== 1 ? "s" : ""}</span>
                        {postsWithLocation > 0 && (
                            <span style={st.bannerStatPill}>📍 {postsWithLocation} with location</span>
                        )}
                    </div>
                </div>

                <div style={st.bannerRight}>
                    <PostsIllustration />
                    {!showForm && (
                        <button
                            style={st.newPostBtn}
                            onClick={() => { setShowForm(true); setSuccessMsg(null); }}
                        >
                            + New Post
                        </button>
                    )}
                </div>
            </div>

            {successMsg && <div style={st.successBox}>{successMsg}</div>}

            {/* ── Create form ── */}
            {showForm && (
                <div style={st.formCard}>
                    <div style={st.formCardHeader}>
                        <h3 style={st.formCardHeaderTitle}>New Donation Post</h3>
                        <p style={st.formCardHeaderSub}>
                            Post your blood availability so seekers can find you when they need your blood type.
                        </p>
                    </div>
                    <div style={st.formCardBody}>

                        {formError && <div style={st.errBox}>{formError}</div>}

                        <div style={st.formGrid}>

                            <div style={page.formRow}>
                                <label style={page.label}>Your Blood Type</label>
                                <select
                                    style={page.input}
                                    value={bloodType}
                                    onChange={e => setBloodType(Number(e.target.value))}
                                >
                                    {BLOOD_TYPE_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={page.formRow}>
                                <label style={page.label}>Quantity (units available)</label>
                                <input
                                    style={page.input}
                                    type="number"
                                    min={1}
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                />
                            </div>

                            <div style={{ ...page.formRow, gridColumn: "1 / -1" }}>
                                <label style={page.label}>Address / Location name (optional)</label>
                                <input
                                    style={page.input}
                                    type="text"
                                    placeholder="e.g. City General Hospital, Beirut"
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                />
                            </div>

                            <div style={{ ...page.formRow, gridColumn: "1 / -1" }}>
                                <label style={page.label}>Pin location on map (optional)</label>

                                {!showMap && (
                                    <div style={st.locRow}>
                                        <button
                                            type="button"
                                            style={st.locationBtn}
                                            onClick={handleUseCurrentLocation}
                                            disabled={submitting || locationStatus === "requesting"}
                                        >
                                            {locationStatus === "requesting" ? "Getting your location…" : "📍 Use my current location"}
                                        </button>
                                        <button
                                            type="button"
                                            style={st.locationBtnSecondary}
                                            onClick={handleChooseOnMap}
                                            disabled={submitting}
                                        >
                                            🗺️ Choose on map
                                        </button>
                                    </div>
                                )}

                                {showMap && (
                                    <>
                                        {isMaximized && (
                                            <div style={st.mapBackdrop} onClick={() => setIsMaximized(false)} />
                                        )}

                                        <div style={isMaximized ? st.mapPanelMaximized : st.mapPanelInline}>

                                            <div style={st.mapPanelHeader}>
                                                <form onSubmit={handleSearch} style={st.searchRow}>
                                                    <input
                                                        style={st.searchInput}
                                                        placeholder="Search for a place or address…"
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
                                                        disabled={submitting}
                                                    />
                                                    <button
                                                        type="submit"
                                                        style={st.searchBtn}
                                                        disabled={submitting || searching || !searchQuery.trim()}
                                                    >
                                                        {searching ? "…" : "🔍"}
                                                    </button>
                                                </form>
                                                <button
                                                    type="button"
                                                    style={st.maximizeBtn}
                                                    onClick={() => setIsMaximized(v => !v)}
                                                    disabled={submitting}
                                                    title={isMaximized ? "Restore map" : "Maximize map"}
                                                >
                                                    {isMaximized ? "⤡" : "⤢"}
                                                </button>
                                            </div>

                                            {searchResults.length > 0 && (
                                                <div style={st.searchResults}>
                                                    {searchResults.map((r, i) => (
                                                        <button
                                                            key={`${r.lat}-${r.lon}-${i}`}
                                                            type="button"
                                                            style={st.searchResultItem}
                                                            onClick={() => handleSelectResult(r)}
                                                        >
                                                            {r.display_name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {searchError && <div style={st.mapHint}>{searchError}</div>}

                                            <MapContainer
                                                ref={mapRef}
                                                center={markerPosition}
                                                zoom={locationStatus === "set" ? 14 : 11}
                                                style={isMaximized
                                                    ? { ...st.formMap, ...st.formMapMaximized }
                                                    : st.formMap}
                                            >
                                                <TileLayer
                                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                />
                                                <LocationMarker
                                                    position={markerPosition}
                                                    onPick={(lat, lng) => applyPosition(lat, lng)}
                                                />
                                            </MapContainer>

                                            <div style={st.mapHint}>
                                                Search above, tap the map, or drag the pin to set your donation location.
                                            </div>

                                            <div style={st.locRow}>
                                                <button
                                                    type="button"
                                                    style={st.locationBtnSmall}
                                                    onClick={handleUseCurrentLocation}
                                                    disabled={submitting || locationStatus === "requesting"}
                                                >
                                                    {locationStatus === "requesting" ? "Locating…" : "📍 Use my current location"}
                                                </button>
                                                <button
                                                    type="button"
                                                    style={st.locationBtnSmall}
                                                    onClick={handleClearLocation}
                                                    disabled={submitting}
                                                >
                                                    ✕ Clear location
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {locationStatus === "denied" && (
                                    <div style={st.mapHint}>
                                        Location access was denied — search or pick a point on the map instead, or continue without one.
                                    </div>
                                )}
                                {locationStatus === "error" && (
                                    <div style={st.mapHint}>
                                        Automatic location isn't available — search or pick a point on the map instead.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={st.formActions}>
                            <button
                                style={{ ...st.createBtn, opacity: submitting ? 0.7 : 1 }}
                                onClick={handleCreate}
                                disabled={submitting}
                            >
                                {submitting ? "Posting…" : "Post Availability"}
                            </button>
                            <button
                                style={st.cancelBtn}
                                onClick={() => { setShowForm(false); resetForm(); }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Post list ── */}
            {postsLoading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
            {postsError   && <p style={{ color: "#dc2626", fontSize: 13 }}>{postsError}</p>}

            {!postsLoading && !postsError && posts.length === 0 && !showForm && (
                <div style={st.emptyState}>
                    <div style={st.emptyIcon}>🩸</div>
                    <p style={st.emptyTitle}>No donation posts yet</p>
                    <p style={st.emptySubtitle}>
                        Signal your blood availability so seekers in need can find you.
                    </p>
                    <button style={st.createBtn} onClick={() => setShowForm(true)}>
                        Create Your First Post
                    </button>
                </div>
            )}

            {!postsLoading && posts.length > 0 && (
                <div style={st.list}>
                    {posts.map((p, i) => {
                        const hasLocation = p.latitude != null && p.longitude != null;
                        const btLabel     = bloodTypeNameStringToLabel(p.bloodTypeName ?? "");
                        return (
                            <div key={p.donationPostId || i} style={st.postCard}>

                                {/* ── Header row ── */}
                                <div style={st.postCardHeader}>
                                    <div style={st.bloodBadge}>{btLabel}</div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={st.postTitle}>{btLabel} Blood Donation</div>
                                        <div style={st.chipsRow}>
                                            <span style={st.unitsBadge}>
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                                </svg>
                                                {p.quantity ?? "?"} units available
                                            </span>
                                            {hasLocation && (
                                                <span style={st.locationChip}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                                                        <circle cx="12" cy="9" r="2.5"/>
                                                    </svg>
                                                    Location pinned
                                                </span>
                                            )}
                                        </div>
                                        {p.donorAddress && (
                                            <div style={st.addressLine}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                                    stroke="#64748b" strokeWidth="2" strokeLinecap="round">
                                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                                                    <circle cx="12" cy="9" r="2.5"/>
                                                </svg>
                                                {p.donorAddress}
                                            </div>
                                        )}
                                    </div>

                                    {p.status === DonationPostStatus.Completed
                                        ? <span style={st.completedPill}>✓ Completed</span>
                                        : <span style={st.activePill}>Active</span>
                                    }
                                </div>

                                {/* ── Map section ── */}
                                {hasLocation && (
                                    <div style={st.mapSection}>
                                        <PostMiniMap lat={p.latitude!} lng={p.longitude!} />
                                        <div style={st.mapOverlay}>
                                            <span style={st.coordBadge}>
                                                {p.latitude!.toFixed(4)}°, {p.longitude!.toFixed(4)}°
                                            </span>
                                            <a
                                                href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={st.gmapsBtn}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                                    <polyline points="15 3 21 3 21 9"/>
                                                    <line x1="10" y1="14" x2="21" y2="3"/>
                                                </svg>
                                                Open in Google Maps
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {/* ── Card footer ── */}
                                <div style={st.cardFooter}>
                                    {p.status === DonationPostStatus.Completed ? (
                                        <div style={st.completedNotice}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                            This donation has been confirmed as received — thank you for saving a life!
                                        </div>
                                    ) : p.isMatched ? (
                                        <div style={st.matchedNotice}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"/>
                                                <line x1="12" y1="8" x2="12" y2="12"/>
                                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                                            </svg>
                                            Linked to an active request — ask the seeker to cancel it first, then you can delete this post.
                                        </div>
                                    ) : (
                                        <button
                                            style={{ ...page.dangerBtn, opacity: deleting === p.donationPostId ? 0.6 : 1 }}
                                            disabled={deleting === p.donationPostId}
                                            onClick={() => handleDelete(p.donationPostId!)}
                                        >
                                            {deleting === p.donationPostId ? "Deleting…" : "Delete Post"}
                                        </button>
                                    )}
                                </div>

                            </div>
                        );
                    })}
                </div>
            )}

        </AppLayout>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const st = {

    // Banner
    pageBanner: {
        background:     "linear-gradient(135deg, #7f1d1d 0%, #c62828 60%, #991b1b 100%)",
        borderRadius:   16,
        padding:        "28px 32px",
        marginBottom:   28,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        position:       "relative" as const,
        overflow:       "hidden",
        boxShadow:      "0 8px 32px rgba(198,40,40,0.25)",
    },
    bannerDecor1: {
        position:     "absolute" as const,
        top:          -50,
        right:        140,
        width:        180,
        height:       180,
        borderRadius: "50%",
        background:   "rgba(255,255,255,0.07)",
        pointerEvents:"none" as const,
    },
    bannerDecor2: {
        position:     "absolute" as const,
        bottom:       -40,
        right:        70,
        width:        120,
        height:       120,
        borderRadius: "50%",
        background:   "rgba(255,255,255,0.05)",
        pointerEvents:"none" as const,
    },
    bannerLeft: {
        zIndex: 1,
    },
    bannerTitle: {
        color:         "#fff",
        fontSize:      24,
        fontWeight:    700,
        margin:        "0 0 4px",
        letterSpacing: "-0.4px",
    },
    bannerSubtitle: {
        color:  "rgba(255,255,255,0.75)",
        fontSize: 14,
        margin: "0 0 14px",
    },
    bannerStats: {
        display: "flex",
        gap:     10,
    },
    bannerStatPill: {
        background:   "rgba(255,255,255,0.15)",
        border:       "1px solid rgba(255,255,255,0.22)",
        borderRadius: 99,
        padding:      "5px 14px",
        fontSize:     12,
        fontWeight:   600,
        color:        "#fff",
    },
    bannerRight: {
        display:    "flex",
        alignItems: "center",
        gap:        20,
        zIndex:     1,
    },
    newPostBtn: {
        padding:      "11px 22px",
        background:   "#fff",
        color:        "#c62828",
        border:       "none",
        borderRadius: 9,
        fontSize:     14,
        fontWeight:   700,
        cursor:       "pointer",
        fontFamily:   "inherit",
        boxShadow:    "0 2px 10px rgba(0,0,0,0.18)",
        whiteSpace:   "nowrap" as const,
    },

    // Post list
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           14,
    },

    // Post card
    postCard: {
        background:   "#fff",
        borderRadius: 14,
        boxShadow:    "0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
        borderLeft:   "4px solid #c62828",
        overflow:     "hidden",
    },
    postCardHeader: {
        display:    "flex",
        alignItems: "center",
        gap:        16,
        padding:    "18px 20px",
    },
    bloodBadge: {
        width:          54,
        height:         54,
        borderRadius:   12,
        background:     "linear-gradient(135deg, #7f1d1d, #c62828)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        color:          "#fff",
        fontWeight:     800,
        fontSize:       14,
        flexShrink:     0,
        boxShadow:      "0 4px 12px rgba(198,40,40,0.35)",
    },
    postTitle: {
        fontSize:     15,
        fontWeight:   700,
        color:        "#0f172a",
        marginBottom: 6,
    },
    chipsRow: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
        flexWrap:   "wrap" as const,
    },
    unitsBadge: {
        display:      "inline-flex",
        alignItems:   "center",
        gap:          5,
        background:   "#eff6ff",
        color:        "#1d4ed8",
        borderRadius: 99,
        padding:      "3px 10px",
        fontSize:     12,
        fontWeight:   600,
    },
    locationChip: {
        display:      "inline-flex",
        alignItems:   "center",
        gap:          4,
        background:   "#f0fdf4",
        color:        "#166534",
        borderRadius: 99,
        padding:      "3px 10px",
        fontSize:     12,
        fontWeight:   600,
    },
    activePill: {
        background:   "#f0fdf4",
        color:        "#166534",
        border:       "1px solid #bbf7d0",
        borderRadius: 99,
        padding:      "4px 12px",
        fontSize:     12,
        fontWeight:   700,
        flexShrink:   0,
    },
    completedPill: {
        background:   "#ede9fe",
        color:        "#6d28d9",
        border:       "1px solid #c4b5fd",
        borderRadius: 99,
        padding:      "4px 12px",
        fontSize:     12,
        fontWeight:   700,
        flexShrink:   0,
    },
    completedNotice: {
        display:    "flex",
        alignItems: "center",
        gap:        7,
        fontSize:   12,
        fontWeight: 500,
        color:      "#065f46",
        background: "#d1fae5",
        border:     "1px solid #6ee7b7",
        borderRadius: 8,
        padding:    "7px 12px",
        lineHeight: 1.45,
    } as React.CSSProperties,
    addressLine: {
        fontSize:   13,
        color:      "#475569",
        marginTop:  6,
        display:    "flex",
        alignItems: "center",
        gap:        5,
    },

    // Map section on post card
    cardFooter: {
        padding:    "12px 18px",
        borderTop:  "1px solid #f1f5f9",
        display:    "flex",
        justifyContent: "flex-end",
        alignItems: "center",
    } as React.CSSProperties,
    matchedNotice: {
        display:    "flex",
        alignItems: "center",
        gap:        7,
        fontSize:   12,
        fontWeight: 500,
        color:      "#92400e",
        background: "#fef3c7",
        border:     "1px solid #fde68a",
        borderRadius: 8,
        padding:    "7px 12px",
        lineHeight: 1.45,
    } as React.CSSProperties,
    mapSection: {
        position:  "relative" as const,
        borderTop: "1px solid #f1f5f9",
    },
    mapOverlay: {
        position:       "absolute" as const,
        bottom:         0,
        left:           0,
        right:          0,
        background:     "linear-gradient(to top, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.38) 60%, transparent 100%)",
        padding:        "40px 16px 14px",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        zIndex:         800,
    },
    coordBadge: {
        background:    "rgba(255,255,255,0.14)",
        border:        "1px solid rgba(255,255,255,0.28)",
        borderRadius:  99,
        padding:       "4px 12px",
        fontSize:      11,
        fontWeight:    600,
        color:         "#fff",
        letterSpacing: "0.03em",
    },
    gmapsBtn: {
        display:        "flex",
        alignItems:     "center",
        gap:            6,
        padding:        "7px 14px",
        background:     "#fff",
        borderRadius:   8,
        fontSize:       12,
        fontWeight:     700,
        color:          "#1e293b",
        textDecoration: "none",
        boxShadow:      "0 2px 10px rgba(0,0,0,0.28)",
        letterSpacing:  "0.01em",
    },

    // Form card
    formCard: {
        background:   "#fff",
        borderRadius: 14,
        boxShadow:    "0 2px 16px rgba(0,0,0,0.08)",
        overflow:     "hidden",
        marginBottom: 24,
    },
    formCardHeader: {
        background: "linear-gradient(135deg, #7f1d1d 0%, #c62828 100%)",
        padding:    "20px 24px",
    },
    formCardHeaderTitle: {
        color:      "#fff",
        fontSize:   17,
        fontWeight: 700,
        margin:     "0 0 3px",
    },
    formCardHeaderSub: {
        color:    "rgba(255,255,255,0.75)",
        fontSize: 13,
        margin:   0,
    },
    formCardBody: {
        padding: "22px 24px",
    },
    formGrid: {
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 14,
    },
    formActions: {
        display:   "flex",
        gap:       10,
        marginTop: 20,
    },
    createBtn: {
        padding:      "11px 24px",
        background:   "linear-gradient(135deg, #7f1d1d, #c62828)",
        color:        "#fff",
        border:       "none",
        borderRadius: 9,
        fontSize:     14,
        fontWeight:   700,
        cursor:       "pointer",
        fontFamily:   "inherit",
        boxShadow:    "0 3px 10px rgba(198,40,40,0.3)",
    },
    cancelBtn: {
        padding:      "11px 20px",
        background:   "#f1f5f9",
        color:        "#334155",
        border:       "1px solid #e2e8f0",
        borderRadius: 9,
        fontSize:     14,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
    },

    // Feedback
    errBox: {
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 9,
        padding:      "10px 14px",
        color:        "#dc2626",
        fontSize:     13,
        marginBottom: 14,
    },
    successBox: {
        background:   "linear-gradient(135deg, #dcfce7, #bbf7d0)",
        border:       "1px solid #86efac",
        borderRadius: 10,
        padding:      "12px 18px",
        color:        "#166534",
        fontSize:     14,
        fontWeight:   600,
        marginBottom: 20,
        boxShadow:    "0 2px 8px rgba(21,128,61,0.1)",
    },

    // Empty state
    emptyState: {
        background:    "#fff",
        borderRadius:  16,
        padding:       "52px 24px",
        boxShadow:     "0 2px 12px rgba(0,0,0,0.06)",
        display:       "flex",
        flexDirection: "column" as const,
        alignItems:    "center",
        gap:           10,
        textAlign:     "center" as const,
    },
    emptyIcon: {
        fontSize:     52,
        opacity:      0.2,
        marginBottom: 4,
        lineHeight:   "1",
    },
    emptyTitle: {
        fontSize:   17,
        fontWeight: 700,
        color:      "#1e293b",
        margin:     0,
    },
    emptySubtitle: {
        fontSize:  14,
        color:     "#64748b",
        margin:    "0 0 8px",
        maxWidth:  340,
    },

    // Location picker
    locRow: {
        display: "flex",
        gap:     10,
    },
    locationBtn: {
        flex:         1,
        padding:      "11px 12px",
        border:       "none",
        borderRadius: 9,
        fontSize:     13,
        fontFamily:   "inherit",
        color:        "#fff",
        background:   "linear-gradient(135deg, #7f1d1d, #c62828)",
        cursor:       "pointer",
        textAlign:    "center" as const,
        fontWeight:   600,
        boxShadow:    "0 2px 8px rgba(198,40,40,0.25)",
    },
    locationBtnSecondary: {
        flex:         1,
        padding:      "11px 12px",
        border:       "1.5px solid #e2e8f0",
        borderRadius: 9,
        fontSize:     13,
        fontFamily:   "inherit",
        color:        "#374151",
        background:   "#f8fafc",
        cursor:       "pointer",
        textAlign:    "center" as const,
        fontWeight:   600,
    },
    locationBtnSmall: {
        flex:         1,
        padding:      "8px 10px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     12,
        fontFamily:   "inherit",
        color:        "#374151",
        background:   "#f8fafc",
        cursor:       "pointer",
        textAlign:    "center" as const,
    },
    mapPanelInline: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           8,
    },
    mapPanelMaximized: {
        position:      "fixed" as const,
        inset:         16,
        zIndex:        1000,
        background:    "#fff",
        borderRadius:  16,
        padding:       16,
        boxShadow:     "0 24px 60px rgba(0,0,0,0.35)",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           8,
    },
    mapBackdrop: {
        position:   "fixed" as const,
        inset:      0,
        background: "rgba(15,23,42,0.55)",
        zIndex:     999,
    },
    mapPanelHeader: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
    },
    searchRow: {
        display: "flex",
        gap:     6,
        flex:    1,
    },
    searchInput: {
        flex:         1,
        padding:      "9px 12px",
        border:       "1.5px solid #e2e8f0",
        borderRadius: 9,
        fontSize:     13,
        fontFamily:   "inherit",
        color:        "#1e293b",
        outline:      "none",
        background:   "#f8fafc",
    },
    searchBtn: {
        padding:      "8px 14px",
        border:       "1px solid #e2e8f0",
        borderRadius: 9,
        fontSize:     13,
        background:   "#fff",
        cursor:       "pointer",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.06)",
    },
    maximizeBtn: {
        flexShrink:   0,
        width:        36,
        height:       36,
        border:       "1px solid #e2e8f0",
        borderRadius: 9,
        fontSize:     15,
        background:   "#f8fafc",
        cursor:       "pointer",
    },
    searchResults: {
        display:       "flex",
        flexDirection: "column" as const,
        maxHeight:     160,
        overflowY:     "auto" as const,
        border:        "1px solid #e2e8f0",
        borderRadius:  9,
        boxShadow:     "0 4px 12px rgba(0,0,0,0.08)",
    },
    searchResultItem: {
        padding:      "9px 12px",
        border:       "none",
        borderBottom: "1px solid #f1f5f9",
        background:   "#fff",
        fontSize:     12,
        color:        "#374151",
        textAlign:    "left" as const,
        cursor:       "pointer",
        fontFamily:   "inherit",
    },
    formMap: {
        height:       280,
        width:        "100%",
        borderRadius: 12,
        overflow:     "hidden",
        border:       "1.5px solid #e2e8f0",
        boxShadow:    "0 4px 16px rgba(0,0,0,0.08)",
    },
    formMapMaximized: {
        flex:      1,
        height:    "auto",
        minHeight: 0,
    },
    mapHint: {
        fontSize: 12,
        color:    "#94a3b8",
        padding:  "2px 0",
    },
};
