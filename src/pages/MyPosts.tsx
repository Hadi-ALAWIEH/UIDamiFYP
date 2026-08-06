import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { createDonationPost, getMyDonationPosts } from "../api/donationPosts";
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

// Read-only thumbnail map shown on each post card that has coordinates.
function PostMiniMap({ lat, lng }: { lat: number; lng: number }) {
    const pos: [number, number] = [lat, lng];
    return (
        <MapContainer
            center={pos}
            zoom={14}
            style={s.miniMap}
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
    const [showForm,     setShowForm]     = useState(false);
    const [submitting,   setSubmitting]   = useState(false);
    const [formError,    setFormError]    = useState<string | null>(null);
    const [successMsg,   setSuccessMsg]   = useState<string | null>(null);

    // ── Form state ─────────────────────────────────────────────────────────
    const [bloodType, setBloodType] = useState(0);
    const [quantity,  setQuantity]  = useState(1);
    const [address,   setAddress]   = useState("");

    // ── Location picker state ──────────────────────────────────────────────
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

    // ── Location picker handlers ───────────────────────────────────────────

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

    // ── Load ───────────────────────────────────────────────────────────────

    function loadPosts() {
        setPostsLoading(true);
        setPostsError(null);
        getMyDonationPosts()
            .then(setPosts)
            .catch(err => setPostsError(err instanceof Error ? err.message : "Failed to load posts."))
            .finally(() => setPostsLoading(false));
    }

    useEffect(loadPosts, []);

    // ── Create post ────────────────────────────────────────────────────────

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

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <AppLayout>

            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>My Donation Posts</h2>
                    <p style={page.subtitle}>Signal your availability to donate blood</p>
                </div>
                {!showForm && (
                    <button style={page.primaryBtn} onClick={() => { setShowForm(true); setSuccessMsg(null); }}>
                        + New Post
                    </button>
                )}
            </header>

            {successMsg && <div style={s.successBox}>{successMsg}</div>}

            {/* ── Create form ── */}
            {showForm && (
                <div style={{ ...page.card, marginBottom: 24 }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                        New Donation Post
                    </h3>
                    <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
                        Post your blood availability so seekers can find you when they need your blood type.
                    </p>

                    {formError && <div style={s.errBox}>{formError}</div>}

                    <div style={s.formGrid}>
                        {/* Blood type */}
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

                        {/* Quantity */}
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

                        {/* Address */}
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

                        {/* Location picker */}
                        <div style={{ ...page.formRow, gridColumn: "1 / -1" }}>
                            <label style={page.label}>Pin location on map (optional)</label>

                            {!showMap && (
                                <div style={s.locRow}>
                                    <button
                                        type="button"
                                        style={s.locationBtn}
                                        onClick={handleUseCurrentLocation}
                                        disabled={submitting || locationStatus === "requesting"}
                                    >
                                        {locationStatus === "requesting" ? "Getting your location…" : "📍 Use my current location"}
                                    </button>
                                    <button
                                        type="button"
                                        style={s.locationBtnSecondary}
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
                                        <div style={s.mapBackdrop} onClick={() => setIsMaximized(false)} />
                                    )}

                                    <div style={isMaximized ? s.mapPanelMaximized : s.mapPanelInline}>

                                        <div style={s.mapPanelHeader}>
                                            <form onSubmit={handleSearch} style={s.searchRow}>
                                                <input
                                                    style={s.searchInput}
                                                    placeholder="Search for a place or address…"
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    disabled={submitting}
                                                />
                                                <button
                                                    type="submit"
                                                    style={s.searchBtn}
                                                    disabled={submitting || searching || !searchQuery.trim()}
                                                >
                                                    {searching ? "…" : "🔍"}
                                                </button>
                                            </form>
                                            <button
                                                type="button"
                                                style={s.maximizeBtn}
                                                onClick={() => setIsMaximized(v => !v)}
                                                disabled={submitting}
                                                title={isMaximized ? "Restore map" : "Maximize map"}
                                            >
                                                {isMaximized ? "⤡" : "⤢"}
                                            </button>
                                        </div>

                                        {searchResults.length > 0 && (
                                            <div style={s.searchResults}>
                                                {searchResults.map((r, i) => (
                                                    <button
                                                        key={`${r.lat}-${r.lon}-${i}`}
                                                        type="button"
                                                        style={s.searchResultItem}
                                                        onClick={() => handleSelectResult(r)}
                                                    >
                                                        {r.display_name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {searchError && <div style={s.mapHint}>{searchError}</div>}

                                        <MapContainer
                                            ref={mapRef}
                                            center={markerPosition}
                                            zoom={locationStatus === "set" ? 14 : 11}
                                            style={isMaximized ? { ...s.map, ...s.mapMaximized } : s.map}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <LocationMarker position={markerPosition} onPick={(lat, lng) => applyPosition(lat, lng)} />
                                        </MapContainer>

                                        <div style={s.mapHint}>
                                            Search above, tap the map, or drag the pin to set your donation location.
                                        </div>

                                        <div style={s.locRow}>
                                            <button
                                                type="button"
                                                style={s.locationBtnSmall}
                                                onClick={handleUseCurrentLocation}
                                                disabled={submitting || locationStatus === "requesting"}
                                            >
                                                {locationStatus === "requesting" ? "Locating…" : "📍 Use my current location"}
                                            </button>
                                            <button
                                                type="button"
                                                style={s.locationBtnSmall}
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
                                <div style={s.mapHint}>
                                    Location access was denied — search or pick a point on the map instead, or continue without one.
                                </div>
                            )}
                            {locationStatus === "error" && (
                                <div style={s.mapHint}>
                                    Automatic location isn't available — search or pick a point on the map instead.
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button
                            style={{ ...page.primaryBtn, opacity: submitting ? 0.7 : 1 }}
                            onClick={handleCreate}
                            disabled={submitting}
                        >
                            {submitting ? "Posting…" : "Post Availability"}
                        </button>
                        <button style={page.secondaryBtn} onClick={() => { setShowForm(false); resetForm(); }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Post list ── */}
            {postsLoading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
            {postsError   && <p style={{ color: "#dc2626", fontSize: 13 }}>{postsError}</p>}

            {!postsLoading && !postsError && posts.length === 0 && !showForm && (
                <div style={page.emptyBox}>
                    <span style={{ fontSize: 36, opacity: 0.3 }}>📌</span>
                    <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>No donation posts yet.</p>
                    <button style={page.primaryBtn} onClick={() => setShowForm(true)}>
                        Create Your First Post
                    </button>
                </div>
            )}

            {!postsLoading && posts.length > 0 && (
                <div style={s.list}>
                    {posts.map((p, i) => (
                        <div key={p.donationPostId || i} style={page.card}>
                            <div style={s.postCardInner}>

                                {/* Left: post details */}
                                <div style={s.postInfo}>
                                    <div style={s.postRow}>
                                        <div style={page.bloodCircle}>
                                            {bloodTypeNameStringToLabel(p.bloodTypeName ?? "")}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={s.postTitle}>
                                                {bloodTypeNameStringToLabel(p.bloodTypeName ?? "")} blood
                                            </div>
                                            <div style={{ fontSize: 13, color: "#64748b" }}>
                                                {p.quantity ?? "?"} unit(s) available
                                            </div>
                                            {p.donorAddress && (
                                                <div style={s.addressLine}>
                                                    📍 {p.donorAddress}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: compact map thumbnail + Google Maps link */}
                                {p.latitude != null && p.longitude != null && (
                                    <div style={s.locationPanel}>
                                        <div style={s.miniMapWrap}>
                                            <PostMiniMap lat={p.latitude} lng={p.longitude} />
                                        </div>
                                        <a
                                            href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={s.gmapsBtn}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                                <polyline points="15 3 21 3 21 9"/>
                                                <line x1="10" y1="14" x2="21" y2="3"/>
                                            </svg>
                                            Open in Google Maps
                                        </a>
                                    </div>
                                )}

                            </div>
                        </div>
                    ))}
                </div>
            )}

        </AppLayout>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    postCardInner: {
        display:    "flex",
        alignItems: "flex-start",
        gap:        20,
    },
    postInfo: {
        flex:     1,
        minWidth: 0,
    },
    postRow: {
        display:    "flex",
        alignItems: "flex-start",
        gap:        14,
    },
    postTitle: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 2,
    },
    addressLine: {
        fontSize:  12,
        color:     "#64748b",
        marginTop: 4,
    },
    locationPanel: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           8,
        flexShrink:    0,
    },
    miniMapWrap: {
        width:        220,
        height:       130,
        borderRadius: 12,
        overflow:     "hidden",
        border:       "1px solid #e2e8f0",
        boxShadow:    "0 2px 10px rgba(0,0,0,0.09)",
        flexShrink:   0,
    },
    miniMap: {
        height: 130,
        width:  220,
    },
    gmapsBtn: {
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            6,
        padding:        "7px 14px",
        background:     "#fff",
        border:         "1px solid #e2e8f0",
        borderRadius:   8,
        fontSize:       12,
        fontWeight:     600,
        color:          "#4285f4",
        textDecoration: "none",
        boxShadow:      "0 1px 4px rgba(0,0,0,0.07)",
        letterSpacing:  "0.01em",
        whiteSpace:     "nowrap" as const,
    },
    formGrid: {
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 14,
    },
    errBox: {
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 7,
        padding:      "9px 13px",
        color:        "#dc2626",
        fontSize:     13,
        marginBottom: 12,
    },
    successBox: {
        background:   "#dcfce7",
        border:       "1px solid #bbf7d0",
        borderRadius: 8,
        padding:      "12px 16px",
        color:        "#166534",
        fontSize:     14,
        fontWeight:   500,
        marginBottom: 20,
    },
    locRow: {
        display: "flex",
        gap:     10,
    },
    locationBtn: {
        flex:         1,
        padding:      "10px 12px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     13,
        fontFamily:   "inherit",
        color:        "#fff",
        background:   "#c62828",
        cursor:       "pointer",
        textAlign:    "center" as const,
    },
    locationBtnSecondary: {
        flex:         1,
        padding:      "10px 12px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     13,
        fontFamily:   "inherit",
        color:        "#374151",
        background:   "#f8fafc",
        cursor:       "pointer",
        textAlign:    "center" as const,
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
        padding:      "8px 10px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     13,
        fontFamily:   "inherit",
        color:        "#1e293b",
        outline:      "none",
    },
    searchBtn: {
        padding:      "8px 12px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     13,
        background:   "#f8fafc",
        cursor:       "pointer",
    },
    maximizeBtn: {
        flexShrink:   0,
        width:        34,
        height:       34,
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
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
        borderRadius:  8,
    },
    searchResultItem: {
        padding:      "8px 10px",
        border:       "none",
        borderBottom: "1px solid #f1f5f9",
        background:   "#fff",
        fontSize:     12,
        color:        "#374151",
        textAlign:    "left" as const,
        cursor:       "pointer",
        fontFamily:   "inherit",
    },
    map: {
        height:       300,
        width:        "100%",
        borderRadius: 10,
        overflow:     "hidden",
        border:       "1px solid #e2e8f0",
    },
    mapMaximized: {
        flex:      1,
        height:    "auto",
        minHeight: 0,
    },
    mapHint: {
        fontSize: 12,
        color:    "#94a3b8",
    },
};
