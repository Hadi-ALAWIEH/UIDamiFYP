import React, { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// ── Leaflet icon fix ───────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// ── Inject pulse keyframes once ────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("dami-loc-css")) {
    const style = document.createElement("style");
    style.id = "dami-loc-css";
    style.textContent = `
        @keyframes damiPulse {
            0%   { box-shadow: 0 0 0 0   rgba(37,99,235,0.55); }
            70%  { box-shadow: 0 0 0 12px rgba(37,99,235,0);   }
            100% { box-shadow: 0 0 0 0   rgba(37,99,235,0);    }
        }
        @keyframes damiPulseOrange {
            0%   { box-shadow: 0 0 0 0   rgba(234,88,12,0.55); }
            70%  { box-shadow: 0 0 0 12px rgba(234,88,12,0);   }
            100% { box-shadow: 0 0 0 0   rgba(234,88,12,0);    }
        }
        .dami-live-dot        { animation: damiPulse       1.6s ease-out infinite; }
        .dami-live-dot-orange { animation: damiPulseOrange 1.6s ease-out infinite; }
    `;
    document.head.appendChild(style);
}

// ── Custom icons ───────────────────────────────────────────────────────────
const originIcon = L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:#16a34a;border-radius:50%;
                border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.35)"></div>`,
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
});

const destIcon = L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:#c62828;border-radius:50%;
                border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.35)"></div>`,
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
});

// Blue pulsing dot — the current user's own live position
const myIcon = L.divIcon({
    className: "",
    html: `<div class="dami-live-dot"
                style="width:16px;height:16px;background:#2563eb;border-radius:50%;
                       border:3px solid #fff;"></div>`,
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
});

// Orange pulsing dot — the other participant's live position
const theirIcon = L.divIcon({
    className: "",
    html: `<div class="dami-live-dot-orange"
                style="width:16px;height:16px;background:#ea580c;border-radius:50%;
                       border:3px solid #fff;"></div>`,
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
});

// ── Fit-bounds helper ──────────────────────────────────────────────────────
// Adjusts the viewport whenever the set of visible points changes.
function BoundsFitter({ points }: { points: [number, number][] }) {
    const map   = useMap();
    const first = useRef(true);

    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            // Only pan/zoom on first mount to avoid fighting the user's manual
            // panning while they drag the map themselves.
            if (first.current) map.setView(points[0], 14);
        } else {
            const opts: L.FitBoundsOptions = { padding: [40, 40], maxZoom: 16 };
            if (first.current) {
                map.fitBounds(points, opts);
            } else {
                // On subsequent updates (live pin moving) only re-fit if the
                // live position is outside the current viewport so the map
                // doesn't jerk around unnecessarily while the user is looking.
                const bounds = map.getBounds();
                const livePoint = points[points.length - 1];
                if (!bounds.contains(livePoint)) {
                    map.panTo(livePoint, { animate: true, duration: 0.5 });
                }
            }
        }
        first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(points)]);

    return null;
}

// ── OSRM route info ────────────────────────────────────────────────────────
interface RouteInfo { distance: string; duration: string; path: [number, number][] }

async function fetchOsrmRoute(
    fromLat: number, fromLng: number,
    toLat:   number, toLng:   number,
): Promise<RouteInfo | null> {
    try {
        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${fromLng},${fromLat};${toLng},${toLat}` +
            `?overview=full&geometries=geojson`;
        const res  = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const route = data?.routes?.[0];
        if (!route) return null;
        const path: [number, number][] =
            route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
        const km   = (route.distance / 1000).toFixed(1);
        const mins = Math.round(route.duration / 60);
        return { path, distance: `${km} km`, duration: `~${mins} min` };
    } catch {
        return null;
    }
}

// ── Public props ───────────────────────────────────────────────────────────
export interface LiveLocationMapProps {
    /** Origin — donation post's saved location (donor's starting point). */
    postLat?: number;
    postLng?: number;
    /** Destination — donation request's saved location (seeker's location). */
    requestLat?: number;
    requestLng?: number;
    /** The current user's own GPS position, from watchPosition. */
    myLat?: number;
    myLng?: number;
    /** The other participant's live GPS position, received via SignalR. */
    theirLat?: number;
    theirLng?: number;
    /** Called when the user collapses the panel manually. */
    onCollapse?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function LiveLocationMap({
    postLat, postLng, requestLat, requestLng,
    myLat, myLng, theirLat, theirLng, onCollapse,
}: LiveLocationMapProps) {
    const [collapsed,  setCollapsed]  = useState(false);
    const [routeInfo,  setRouteInfo]  = useState<RouteInfo | null>(null);
    const mapRef = useRef<L.Map | null>(null);

    // Fetch OSRM route once both fixed endpoints are known.
    useEffect(() => {
        if (postLat == null || postLng == null || requestLat == null || requestLng == null) return;
        fetchOsrmRoute(postLat, postLng, requestLat, requestLng).then(setRouteInfo);
    }, [postLat, postLng, requestLat, requestLng]);

    // Invalidate Leaflet's size whenever the panel expands (container height change).
    useEffect(() => {
        if (!collapsed) {
            window.setTimeout(() => mapRef.current?.invalidateSize(), 60);
        }
    }, [collapsed]);

    const hasPost    = postLat   != null && postLng   != null;
    const hasRequest = requestLat != null && requestLng != null;
    const hasMe      = myLat     != null && myLng     != null;
    const hasThem    = theirLat  != null && theirLng  != null;

    // Points to include in the bounds calculation.
    const boundsPoints: [number, number][] = [
        ...(hasPost    ? [[postLat!,    postLng!   ] as [number, number]] : []),
        ...(hasRequest ? [[requestLat!, requestLng!] as [number, number]] : []),
        ...(hasMe      ? [[myLat!,      myLng!     ] as [number, number]] : []),
        ...(hasThem    ? [[theirLat!,   theirLng!  ] as [number, number]] : []),
    ];

    const mapCenter: [number, number] =
        boundsPoints[0] ?? [33.8938, 35.5018]; // Beirut fallback

    function handleCollapse() {
        setCollapsed(v => !v);
        if (!collapsed) onCollapse?.();
    }

    const statusText =
        hasMe && hasThem ? "Both sharing live location" :
        hasMe            ? "You are sharing your location" :
        hasThem          ? "Other participant is sharing" :
                           "Waiting for GPS signal…";

    return (
        <div style={s.panel}>
            {/* ── Header ── */}
            <div style={s.header}>
                <span style={s.headerIcon}>📍</span>
                <div style={s.headerText}>
                    <span style={s.headerTitle}>Live tracking</span>
                    {routeInfo && (
                        <span style={s.routeMeta}>
                            {routeInfo.distance} · {routeInfo.duration} by car
                        </span>
                    )}
                </div>
                <span style={s.statusBadge}>{statusText}</span>
                <button
                    style={s.collapseBtn}
                    onClick={handleCollapse}
                    title={collapsed ? "Expand map" : "Collapse map"}
                >
                    {collapsed ? "▼" : "▲"}
                </button>
            </div>

            {/* ── Map ── */}
            {!collapsed && (
                <MapContainer
                    ref={mapRef}
                    center={mapCenter}
                    zoom={12}
                    style={s.map}
                    zoomControl
                    scrollWheelZoom
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {boundsPoints.length > 0 && <BoundsFitter points={boundsPoints} />}

                    {/* OSRM route polyline */}
                    {routeInfo && routeInfo.path.length > 0 && (
                        <Polyline
                            positions={routeInfo.path}
                            color="#2563eb"
                            weight={4}
                            opacity={0.65}
                            dashArray="10 6"
                        />
                    )}

                    {/* Donation post location — donor's origin */}
                    {hasPost && (
                        <Marker position={[postLat!, postLng!]} icon={originIcon}>
                            <Tooltip permanent direction="top" offset={[0, -10]}>
                                <span style={{ fontSize: 11 }}>🟢 Donor's pickup point</span>
                            </Tooltip>
                        </Marker>
                    )}

                    {/* Donation request location — seeker's destination */}
                    {hasRequest && (
                        <Marker position={[requestLat!, requestLng!]} icon={destIcon}>
                            <Tooltip permanent direction="top" offset={[0, -10]}>
                                <span style={{ fontSize: 11 }}>🔴 Seeker's location</span>
                            </Tooltip>
                        </Marker>
                    )}

                    {/* Current user's live position — animated blue dot */}
                    {hasMe && (
                        <Marker position={[myLat!, myLng!]} icon={myIcon}>
                            <Tooltip direction="top" offset={[0, -10]}>
                                <span style={{ fontSize: 11 }}>🔵 You are here</span>
                            </Tooltip>
                        </Marker>
                    )}

                    {/* Other participant's live position — animated orange dot */}
                    {hasThem && (
                        <Marker position={[theirLat!, theirLng!]} icon={theirIcon}>
                            <Tooltip direction="top" offset={[0, -10]}>
                                <span style={{ fontSize: 11 }}>🟠 Other participant</span>
                            </Tooltip>
                        </Marker>
                    )}
                </MapContainer>
            )}

            {/* ── Legend ── */}
            {!collapsed && (
                <div style={s.legend}>
                    {hasPost    && <LegendDot color="#16a34a" label="Donor's pickup point" />}
                    {hasRequest && <LegendDot color="#c62828" label="Seeker's location" />}
                    {hasMe      && <LegendDot color="#2563eb" label="Your live position" pulse />}
                    {hasThem    && <LegendDot color="#ea580c" label="Other participant" pulse />}
                </div>
            )}
        </div>
    );
}

function LegendDot({ color, label, pulse }: { color: string; label: string; pulse?: boolean }) {
    const pulseAnim = color === "#ea580c"
        ? "damiPulseOrange 1.6s ease-out infinite"
        : "damiPulse 1.6s ease-out infinite";
    return (
        <div style={s.legendItem}>
            <div style={{
                ...s.legendDot,
                background: color,
                ...(pulse ? { animation: pulseAnim } : {}),
            }} />
            <span style={s.legendLabel}>{label}</span>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
    panel: {
        flexShrink:   0,
        borderBottom: "1px solid #e2e8f0",
        background:   "#fff",
    } as React.CSSProperties,
    header: {
        display:     "flex",
        alignItems:  "center",
        gap:         8,
        padding:     "10px 16px",
        background:  "linear-gradient(90deg, #eff6ff 0%, #fff 100%)",
        borderBottom:"1px solid #e2e8f0",
        flexShrink:  0,
    } as React.CSSProperties,
    headerIcon: {
        fontSize:  16,
        flexShrink: 0,
    } as React.CSSProperties,
    headerText: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           1,
        flex:          1,
        minWidth:      0,
    } as React.CSSProperties,
    headerTitle: {
        fontSize:   13,
        fontWeight: 700,
        color:      "#1e40af",
    } as React.CSSProperties,
    routeMeta: {
        fontSize: 11,
        color:    "#64748b",
    } as React.CSSProperties,
    statusBadge: {
        fontSize:     11,
        fontWeight:   600,
        color:        "#1e40af",
        background:   "#dbeafe",
        padding:      "3px 8px",
        borderRadius: 99,
        whiteSpace:   "nowrap" as const,
        flexShrink:   0,
    } as React.CSSProperties,
    collapseBtn: {
        background:   "none",
        border:       "1px solid #e2e8f0",
        borderRadius: 6,
        width:        28,
        height:       28,
        fontSize:     11,
        cursor:       "pointer",
        color:        "#64748b",
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
    } as React.CSSProperties,
    map: {
        height: 260,
        width:  "100%",
    } as React.CSSProperties,
    legend: {
        display:    "flex",
        gap:        16,
        padding:    "7px 16px",
        flexWrap:   "wrap" as const,
        borderTop:  "1px solid #f1f5f9",
        background: "#fafafa",
    } as React.CSSProperties,
    legendItem: {
        display:    "flex",
        alignItems: "center",
        gap:        5,
    } as React.CSSProperties,
    legendDot: {
        width:        9,
        height:       9,
        borderRadius: "50%",
        flexShrink:   0,
    } as React.CSSProperties,
    legendLabel: {
        fontSize: 11,
        color:    "#64748b",
    } as React.CSSProperties,
};
