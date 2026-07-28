import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { completeUserOnboarding } from "../api/profile";
import { logout } from "../auth/Keycloak.ts";
import { useUser } from "../context/UserContext.tsx";
import { BusinessRole } from "../types";

// Leaflet's default marker icon paths break under Vite's bundling — point
// them at the bundled asset URLs explicitly. This only needs to run once.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl:       markerIcon,
    shadowUrl:     markerShadow,
});

// Fallback map center used before the user shares/picks a location (Beirut).
const DEFAULT_CENTER: [number, number] = [33.8938, 35.5018];

// BusinessRole options shown to the user during onboarding.
// TODO: BACKEND – Update values/labels if new roles are added.
const ROLE_OPTIONS = [
    { value: BusinessRole.Donor,          label: "Blood Donor"        },
    { value: BusinessRole.Seeker,         label: "Blood Seeker"       },
    { value: BusinessRole.DonorAndSeeker, label: "Both (Donor & Seeker)" },
];

type LocationStatus = "idle" | "requesting" | "set" | "denied" | "error";
type SearchResult = { display_name: string; lat: string; lon: string };

// Draggable/clickable pin. Clicking anywhere on the map, or dragging the
// pin, updates the picked coordinates — the user never types or sees the
// raw numbers, only the pin's position on the map.
function LocationMarker({
    position,
    onPick,
}: {
    position: [number, number];
    onPick: (lat: number, lng: number) => void;
}) {
    useMapEvents({
        click(e) {
            onPick(e.latlng.lat, e.latlng.lng);
        },
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

export default function Onboarding() {
    const navigate    = useNavigate();
    const { setProfile } = useUser();

    const [name,         setName]         = useState("");
    const [businessRole, setBusinessRole] = useState<BusinessRole>(BusinessRole.Seeker);
    const [latitude,     setLatitude]     = useState<number | undefined>();
    const [longitude,    setLongitude]    = useState<number | undefined>();
    const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
    const [showMap,      setShowMap]      = useState(false);
    const [isMaximized,  setIsMaximized]  = useState(false);
    const [isAvailable,  setIsAvailable]  = useState(true);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState<string | null>(null);

    // Place search (geocoding) — uses OpenStreetMap's free Nominatim API.
    // NOTE: for a production/high-traffic deployment, Nominatim's usage
    // policy asks that requests be proxied through your own backend rather
    // than called directly from the browser. Fine for local dev / FYP use.
    const [searchQuery,   setSearchQuery]   = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching,     setSearching]     = useState(false);
    const [searchError,   setSearchError]   = useState<string | null>(null);

    const mapRef = useRef<L.Map | null>(null);

    const markerPosition = useMemo<[number, number]>(
        () => [latitude ?? DEFAULT_CENTER[0], longitude ?? DEFAULT_CENTER[1]],
        [latitude, longitude]
    );

    // Re-measure the map after the container resizes (maximize/restore),
    // otherwise Leaflet keeps rendering at its old size/tile positions.
    useEffect(() => {
        if (!showMap) return;
        const id = window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
        return () => window.clearTimeout(id);
    }, [isMaximized, showMap]);

    // Let Escape restore the maximized map, and stop the page from
    // scrolling behind it while it's covering the screen.
    useEffect(() => {
        if (!isMaximized) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setIsMaximized(false);
        }
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
        if (opts?.pan) {
            mapRef.current?.setView([lat, lng], 15);
        }
    }

    // Uses the browser's native permission prompt to grab the device's GPS
    // location, then opens the map centered there so the user can see it or
    // fine-tune it (drag the pin) rather than being stuck with it.
    function handleUseCurrentLocation() {
        if (!("geolocation" in navigator)) {
            setLocationStatus("error");
            setShowMap(true);
            return;
        }

        setLocationStatus("requesting");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                applyPosition(position.coords.latitude, position.coords.longitude, { pan: true });
                setShowMap(true);
            },
            () => {
                setLocationStatus("denied");
                setShowMap(true);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    // Opens the map without requesting GPS access, so a user who doesn't
    // want to share their exact device location can still pick a point
    // manually (e.g. their city, a hospital address, etc).
    function handleChooseOnMap() {
        setShowMap(true);
    }

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
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`
            );
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

    async function handleSubmit() {
        if (!name.trim()) {
            setError("Please enter your name.");
            return;
        }
        setError(null);
        setLoading(true);

        try {
            // POST /api/CompleteOnboarding
            // The response is stored in UserContext (sessionStorage) so the
            // dashboard and other pages can read the user's name and role.
            const profile = await completeUserOnboarding({
                name:         name.trim(),
                businessRole,
                latitude,
                longitude,
                isAvailable,
            });

            setProfile(profile);
            sessionStorage.setItem("profileCompleted", "true");
            navigate("/dashboard");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Something went wrong.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={s.page}>
            <div style={s.card}>

                <div style={s.iconCircle}>🩸</div>

                <h1 style={s.title}>Complete Your Profile</h1>
                <p style={s.subtitle}>
                    Tell us how you want to contribute to the blood donation community.
                </p>

                {error && <div style={s.errorBox}>{error}</div>}

                {/* Name */}
                <div style={s.field}>
                    <label style={s.label}>Full Name</label>
                    <input
                        style={s.input}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Your full name"
                        disabled={loading}
                    />
                </div>

                {/* Role */}
                <div style={s.field}>
                    <label style={s.label}>Your Role</label>
                    <select
                        style={s.input}
                        value={businessRole}
                        onChange={e => setBusinessRole(Number(e.target.value) as BusinessRole)}
                        disabled={loading}
                    >
                        {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Location — optional. The user never types or sees raw
                    coordinates: they share their GPS location, search for a
                    place, or pick a point on the map — only a status/pin is
                    ever shown. */}
                <div style={s.field}>
                    <label style={s.label}>Location (optional)</label>

                    {!showMap && (
                        <div style={s.row}>
                            <button
                                type="button"
                                style={s.locationBtn}
                                onClick={handleUseCurrentLocation}
                                disabled={loading || locationStatus === "requesting"}
                            >
                                {locationStatus === "requesting" ? "Getting your location…" : "📍 Use my current location"}
                            </button>
                            <button
                                type="button"
                                style={s.locationBtnSecondary}
                                onClick={handleChooseOnMap}
                                disabled={loading}
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
                                            disabled={loading}
                                        />
                                        <button
                                            type="submit"
                                            style={s.searchBtn}
                                            disabled={loading || searching || !searchQuery.trim()}
                                        >
                                            {searching ? "…" : "🔍"}
                                        </button>
                                    </form>
                                    <button
                                        type="button"
                                        style={s.maximizeBtn}
                                        onClick={() => setIsMaximized(v => !v)}
                                        disabled={loading}
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
                                {searchError && <div style={s.locationHint}>{searchError}</div>}

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
                                    Search above, tap the map, or drag the pin to set your location.
                                </div>

                                <div style={s.row}>
                                    <button
                                        type="button"
                                        style={s.locationBtnSmall}
                                        onClick={handleUseCurrentLocation}
                                        disabled={loading || locationStatus === "requesting"}
                                    >
                                        {locationStatus === "requesting" ? "Locating…" : "📍 Use my current location"}
                                    </button>
                                    <button
                                        type="button"
                                        style={s.locationBtnSmall}
                                        onClick={handleClearLocation}
                                        disabled={loading}
                                    >
                                        ✕ Clear location
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {locationStatus === "denied" && (
                        <div style={s.locationHint}>
                            Location access was denied — search or pick a point on the map instead, or continue without one.
                        </div>
                    )}
                    {locationStatus === "error" && (
                        <div style={s.locationHint}>
                            Automatic location isn't available on this device/browser — search or pick a point on the map instead.
                        </div>
                    )}
                </div>

                {/* Availability — only relevant for donors */}
                {(businessRole === BusinessRole.Donor || businessRole === BusinessRole.DonorAndSeeker) && (
                    <div style={s.toggleRow}>
                        <div>
                            <div style={s.toggleLabel}>Available to donate now</div>
                            <div style={s.toggleHint}>You can change this later from your dashboard.</div>
                        </div>
                        <button
                            style={{
                                ...s.toggle,
                                background: isAvailable ? "#c62828" : "#e2e8f0",
                            }}
                            onClick={() => setIsAvailable(v => !v)}
                            disabled={loading}
                        >
                            <span style={{
                                ...s.toggleThumb,
                                transform: isAvailable ? "translateX(20px)" : "translateX(2px)",
                            }} />
                        </button>
                    </div>
                )}

                <button
                    style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? "Setting up your profile…" : "Complete Profile"}
                </button>

                <button style={s.logoutLink} onClick={logout}>
                    Sign out
                </button>

            </div>
        </div>
    );
}

const s = {
    page: {
        minHeight:      "100vh",
        display:        "flex",
        justifyContent: "center",
        alignItems:     "center",
        background:     "linear-gradient(135deg, #fff 0%, #ffe8e8 100%)",
        padding:        "24px 16px",
        boxSizing:      "border-box" as const,
    },
    card: {
        width:         "100%",
        maxWidth:      440,
        padding:       "40px 36px",
        borderRadius:  20,
        background:    "#fff",
        boxShadow:     "0 20px 48px rgba(0,0,0,0.12)",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           16,
    },
    iconCircle: {
        margin:         "0 auto",
        width:          64,
        height:         64,
        borderRadius:   "50%",
        background:     "#c62828",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       30,
    },
    title: {
        color:      "#c62828",
        fontSize:   22,
        fontWeight: 700,
        textAlign:  "center" as const,
        margin:     0,
    },
    subtitle: {
        color:      "#64748b",
        textAlign:  "center" as const,
        fontSize:   14,
        margin:     0,
    },
    errorBox: {
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 8,
        padding:      "10px 14px",
        color:        "#dc2626",
        fontSize:     13,
    },
    field: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           6,
    },
    label: {
        fontSize:   13,
        fontWeight: 600,
        color:      "#374151",
    },
    input: {
        padding:      "11px 12px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     14,
        fontFamily:   "inherit",
        color:        "#1e293b",
        outline:      "none",
        flex:         1,
    },
    row: {
        display: "flex",
        gap:     10,
    },
    locationBtn: {
        flex:         1,
        padding:      "11px 12px",
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
        padding:      "11px 12px",
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
        display:        "flex",
        alignItems:     "center",
        gap:            8,
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
        padding:     "8px 10px",
        border:      "none",
        borderBottom: "1px solid #f1f5f9",
        background:  "#fff",
        fontSize:    12,
        color:       "#374151",
        textAlign:   "left" as const,
        cursor:      "pointer",
        fontFamily:  "inherit",
    },
    map: {
        height:       340,
        width:        "100%",
        borderRadius: 12,
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
    locationHint: {
        fontSize: 12,
        color:    "#94a3b8",
    },
    toggleRow: {
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "12px 14px",
        background:     "#f8fafc",
        borderRadius:   10,
        border:         "1px solid #e2e8f0",
    },
    toggleLabel: {
        fontSize:   14,
        fontWeight: 600,
        color:      "#1e293b",
    },
    toggleHint: {
        fontSize: 12,
        color:    "#94a3b8",
        marginTop: 2,
    },
    toggle: {
        width:        44,
        height:       26,
        borderRadius: 13,
        border:       "none",
        cursor:       "pointer",
        position:     "relative" as const,
        flexShrink:   0,
        transition:   "background 0.2s",
        padding:      0,
    },
    toggleThumb: {
        position:     "absolute" as const,
        top:          3,
        width:        20,
        height:       20,
        borderRadius: "50%",
        background:   "#fff",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.2)",
        transition:   "transform 0.2s",
    },
    submitBtn: {
        padding:      "13px",
        borderRadius: 10,
        border:       "none",
        background:   "#c62828",
        color:        "#fff",
        fontSize:     15,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
        marginTop:    4,
    },
    logoutLink: {
        background:  "none",
        border:      "none",
        color:       "#94a3b8",
        fontSize:    13,
        cursor:      "pointer",
        textAlign:   "center" as const,
        fontFamily:  "inherit",
    },
};
