import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { bloodTypeNameStringToLabel, BLOOD_TYPE_NAME_OPTIONS } from "../utils/bloodTypes";
import {
    getMyDonationRequests,
    createDonationRequest,
    deleteDonationRequest,
    confirmMatch,
    type CreateDonationRequestPayload,
} from "../api/donationRequests";
import {
    DonationRequestStatus,
    DonationRequestUrgency,
    type DonationRequestViewModel,
    type DonationPostCandidateViewModel,
} from "../types";

// ── Leaflet icon fix (Vite bundling breaks default asset paths) ────────────
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl:       markerIcon,
    shadowUrl:     markerShadow,
});

const DEFAULT_CENTER: [number, number] = [33.8938, 35.5018];

type LocationStatus = "idle" | "requesting" | "set" | "denied" | "error";
type SearchResult   = { display_name: string; lat: string; lon: string };

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

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function statusMeta(s: DonationRequestStatus) {
    switch (s) {
        case DonationRequestStatus.Pending:   return { bg: "#fef9c3", color: "#854d0e", label: "Pending"   };
        case DonationRequestStatus.Matched:   return { bg: "#dbeafe", color: "#1e40af", label: "Matched"   };
        case DonationRequestStatus.Completed: return { bg: "#dcfce7", color: "#166534", label: "Completed" };
        case DonationRequestStatus.Cancelled: return { bg: "#fee2e2", color: "#991b1b", label: "Cancelled" };
        default:                              return { bg: "#f3f4f6", color: "#374151", label: "Unknown"   };
    }
}

function urgencyLabel(u: DonationRequestUrgency) {
    switch (u) {
        case DonationRequestUrgency.High:   return "⚠ High";
        case DonationRequestUrgency.Medium: return "Medium";
        default:                            return "Low";
    }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyRequests() {
    const [requests,   setRequests]   = useState<DonationRequestViewModel[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState<string | null>(null);
    const [showForm,   setShowForm]   = useState(false);
    const [candidates, setCandidates] = useState<{
        donationRequestId: number;
        list: DonationPostCandidateViewModel[];
    } | null>(null);
    const [submitting,  setSubmitting]  = useState(false);
    const [deleting,    setDeleting]    = useState<number | null>(null);
    const [confirming,  setConfirming]  = useState<number | null>(null);

    // ── Form state ──────────────────────────────────────────────────────────
    // bloodTypeName is sent as the enum name string (backend field is string? + Enum.TryParse)
    const [formBloodType,    setFormBloodType]    = useState("APositive");
    const [formQuantity,     setFormQuantity]     = useState(1);
    const [formUrgency,      setFormUrgency]      = useState(DonationRequestUrgency.Medium);
    const [formAddress,      setFormAddress]      = useState("");
    const [formNeededBy,     setFormNeededBy]     = useState("");
    const [formError,        setFormError]        = useState<string | null>(null);

    // ── Location picker state (mirrors Onboarding.tsx) ──────────────────────
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

    // ── Location picker handlers ────────────────────────────────────────────

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

    // ── Load ────────────────────────────────────────────────────────────────

    function load() {
        setLoading(true);
        setError(null);
        // GET /api/donationrequest/current-user-donation-requests
        getMyDonationRequests()
            .then(setRequests)
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load."))
            .finally(() => setLoading(false));
    }

    useEffect(load, []);

    // ── Create request ──────────────────────────────────────────────────────

    async function handleCreate() {
        if (formQuantity < 1) { setFormError("Quantity must be at least 1."); return; }
        setFormError(null);
        setSubmitting(true);

        const payload: CreateDonationRequestPayload = {
            bloodTypeName: formBloodType,
            quantity:      formQuantity,
            urgency:       formUrgency,
            address:       formAddress || undefined,
            latitude,
            longitude,
            neededByDate:  formNeededBy ? new Date(formNeededBy).toISOString() : undefined,
        };

        try {
            // POST /api/donationrequest — returns the new request + matching candidates
            const result = await createDonationRequest(payload);
            setRequests(prev => [result.donationRequest, ...prev]);
            setShowForm(false);

            if (result.candidates.length > 0) {
                // Show matched donors so the seeker can confirm one
                setCandidates({
                    donationRequestId: result.donationRequest.id,
                    list: result.candidates,
                });
            }
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to create request.");
        } finally {
            setSubmitting(false);
        }
    }

    // ── Delete request ──────────────────────────────────────────────────────

    async function handleDelete(id: number) {
        if (!confirm("Delete this request?")) return;
        setDeleting(id);
        try {
            // DELETE /api/donationrequest/{id}
            await deleteDonationRequest(id);
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete.");
        } finally {
            setDeleting(null);
        }
    }

    // ── Confirm match ───────────────────────────────────────────────────────

    async function handleConfirmMatch(donationPostId: number) {
        if (!candidates) return;
        setConfirming(donationPostId);
        try {
            // POST /api/donationrequest/confirm-match
            // This creates a Match + Conversation between the seeker and donor.
            await confirmMatch({
                donationRequestId: candidates.donationRequestId,
                donationPostId,
            });
            setCandidates(null);
            load(); // refresh the list
            alert("Match confirmed! A conversation has been created.");
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to confirm match.");
        } finally {
            setConfirming(null);
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <AppLayout>

            {/* Top bar */}
            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>My Requests</h2>
                    <p style={page.subtitle}>Blood donation requests you have submitted</p>
                </div>
                {!showForm && (
                    <button style={page.primaryBtn} onClick={() => setShowForm(true)}>
                        + New Request
                    </button>
                )}
            </header>

            {/* ── Create form ── */}
            {showForm && (
                <div style={{ ...page.card, marginBottom: 24 }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                        New Donation Request
                    </h3>

                    {formError && <div style={s.errBox}>{formError}</div>}

                    <div style={s.formGrid}>
                        {/* Blood type */}
                        <div style={page.formRow}>
                            <label style={page.label}>Blood Type</label>
                            <select
                                style={page.input}
                                value={formBloodType}
                                onChange={e => setFormBloodType(e.target.value)}
                            >
                                {BLOOD_TYPE_NAME_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Quantity */}
                        <div style={page.formRow}>
                            <label style={page.label}>Quantity (units)</label>
                            <input
                                style={page.input}
                                type="number"
                                min={1}
                                value={formQuantity}
                                onChange={e => setFormQuantity(Number(e.target.value))}
                            />
                        </div>

                        {/* Urgency */}
                        <div style={page.formRow}>
                            <label style={page.label}>Urgency</label>
                            <select
                                style={page.input}
                                value={formUrgency}
                                onChange={e => setFormUrgency(Number(e.target.value))}
                            >
                                <option value={DonationRequestUrgency.Low}>Low</option>
                                <option value={DonationRequestUrgency.Medium}>Medium</option>
                                <option value={DonationRequestUrgency.High}>High</option>
                            </select>
                        </div>

                        {/* Needed by date */}
                        <div style={page.formRow}>
                            <label style={page.label}>Needed By (optional)</label>
                            <input
                                style={page.input}
                                type="date"
                                value={formNeededBy}
                                onChange={e => setFormNeededBy(e.target.value)}
                            />
                        </div>

                        {/* Address */}
                        <div style={{ ...page.formRow, gridColumn: "1 / -1" }}>
                            <label style={page.label}>Address / Hospital (optional)</label>
                            <input
                                style={page.input}
                                type="text"
                                placeholder="e.g. City General Hospital, Downtown"
                                value={formAddress}
                                onChange={e => setFormAddress(e.target.value)}
                            />
                        </div>

                        {/* Location picker — optional */}
                        <div style={{ ...page.formRow, gridColumn: "1 / -1" }}>
                            <label style={page.label}>Location (optional)</label>

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
                                                aria-label={isMaximized ? "Restore map" : "Maximize map"}
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
                                            Search above, tap the map, or drag the pin to set the location.
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
                                    Automatic location isn't available on this device/browser — search or pick a point on the map instead.
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
                            {submitting ? "Submitting…" : "Submit Request"}
                        </button>
                        <button style={page.secondaryBtn} onClick={() => setShowForm(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Candidates panel ── */}
            {candidates && candidates.list.length > 0 && (
                <div style={{ ...page.card, marginBottom: 24, borderLeft: "3px solid #c62828" }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#1e293b" }}>
                        Matching Donors Found!
                    </h3>
                    <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b" }}>
                        Select a donor to confirm the match. A conversation will open automatically.
                    </p>
                    <div style={s.candidateList}>
                        {candidates.list.map(c => (
                            <div key={c.donationPostId} style={s.candidateRow}>
                                <div style={page.bloodCircle}>{bloodTypeNameStringToLabel(c.bloodTypeName)}</div>
                                <div style={{ flex: 1 }}>
                                    {/* TODO: BACKEND – donorName comes from DonationPostCandidateViewModel */}
                                    <div style={s.candidateName}>{c.donorName}</div>
                                    <div style={{ fontSize: 12, color: "#64748b" }}>
                                        {c.donorAddress ?? "No address"} · {c.quantity ?? "?"} unit(s)
                                    </div>
                                </div>
                                <button
                                    style={{ ...page.primaryBtn, opacity: confirming === c.donationPostId ? 0.7 : 1 }}
                                    onClick={() => handleConfirmMatch(c.donationPostId)}
                                    disabled={confirming !== null}
                                >
                                    {confirming === c.donationPostId ? "Confirming…" : "Confirm Match"}
                                </button>
                            </div>
                        ))}
                    </div>
                    <button style={{ ...page.secondaryBtn, marginTop: 12 }} onClick={() => setCandidates(null)}>
                        Dismiss
                    </button>
                </div>
            )}

            {/* ── Requests list ── */}
            {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
            {error   && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

            {!loading && !error && requests.length === 0 && !showForm && (
                <div style={page.emptyBox}>
                    <span style={{ fontSize: 36, opacity: 0.3 }}>📋</span>
                    <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>No requests yet.</p>
                    <button style={page.primaryBtn} onClick={() => setShowForm(true)}>
                        Create Your First Request
                    </button>
                </div>
            )}

            {!loading && requests.length > 0 && (
                <div style={s.list}>
                    {requests.map(r => {
                        const sm = statusMeta(r.status);
                        return (
                            <div key={r.id} style={page.card}>
                                <div style={s.requestRow}>
                                    <div style={page.bloodCircle}>{bloodTypeNameStringToLabel(r.bloodTypeName)}</div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={s.reqTitle}>
                                            {/* TODO: BACKEND – r.address is the location from DonationRequestViewModel */}
                                            {r.address ?? "No address provided"}
                                        </div>
                                        <div style={s.reqMeta}>
                                            <span style={{ fontSize: 12, color: "#64748b" }}>
                                                {r.quantity ?? "?"} unit(s) · {urgencyLabel(r.urgency)} urgency
                                            </span>
                                            {r.neededByDate && (
                                                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                                                    · Needed by {fmtDate(r.neededByDate)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                                            Created {fmtDate(r.createdAt)}
                                        </div>
                                    </div>

                                    <div style={s.reqActions}>
                                        <span style={page.statusChip(sm.bg, sm.color)}>{sm.label}</span>
                                        {r.status === DonationRequestStatus.Pending && (
                                            <button
                                                style={{ ...page.dangerBtn, opacity: deleting === r.id ? 0.6 : 1 }}
                                                onClick={() => handleDelete(r.id)}
                                                disabled={deleting === r.id}
                                            >
                                                {deleting === r.id ? "Deleting…" : "Delete"}
                                            </button>
                                        )}
                                    </div>
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

const s = {
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
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    requestRow: {
        display:    "flex",
        alignItems: "center",
        gap:        14,
    },
    reqTitle: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 3,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    },
    reqMeta: {
        display: "flex",
        gap:     6,
    },
    reqActions: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
        flexShrink: 0,
    },
    candidateList: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    candidateRow: {
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        padding:      "12px",
        background:   "#f8fafc",
        borderRadius: 8,
        border:       "1px solid #e2e8f0",
    },
    candidateName: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 2,
    },

    // Location picker
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
