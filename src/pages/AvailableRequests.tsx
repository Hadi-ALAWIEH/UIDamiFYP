import { useEffect, useState } from "react";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { getAllDonationRequests } from "../api/donationRequests";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import {
    type DonationRequestViewModel,
    DonationRequestStatus,
    DonationRequestUrgency,
} from "../types";

// This page is for Donors only (CanViewAvailableDonationRequests policy).
// It shows all pending donation requests so donors can see where blood is needed.
// The matching flow is seeker-initiated: seekers confirm matches after creating a request.
// Donors do not directly respond here — they simply need to have an active donation post.

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function urgencyMeta(u: DonationRequestUrgency) {
    switch (u) {
        case DonationRequestUrgency.High:   return { bg: "#fee2e2", color: "#991b1b", label: "High"   };
        case DonationRequestUrgency.Medium: return { bg: "#fef3c7", color: "#92400e", label: "Medium" };
        default:                            return { bg: "#f3f4f6", color: "#374151", label: "Low"    };
    }
}

export default function AvailableRequests() {
    const [requests, setRequests] = useState<DonationRequestViewModel[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState<string | null>(null);

    useEffect(() => {
        // GET /api/donationrequest — returns ALL pending requests (Donor policy only)
        getAllDonationRequests()
            .then(data => {
                // Filter to only pending requests on the frontend as a safety net.
                // TODO: BACKEND – If the backend already filters by status=Pending, remove this filter.
                setRequests(data.filter(r => r.status === DonationRequestStatus.Pending));
            })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load requests."))
            .finally(() => setLoading(false));
    }, []);

    return (
        <AppLayout>

            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>Available Requests</h2>
                    <p style={page.subtitle}>
                        Blood seekers who need donors · {requests.length} open request{requests.length !== 1 ? "s" : ""}
                    </p>
                </div>
            </header>

            {/* Informational banner */}
            <div style={s.infoBanner}>
                <span style={{ fontSize: 18 }}>ℹ️</span>
                <p style={{ margin: 0, fontSize: 13, color: "#1e40af" }}>
                    To be matched with a seeker, make sure you have an active{" "}
                    <strong>Donation Post</strong> with a matching blood type and quantity.
                    Seekers will reach out to confirm a match.
                </p>
            </div>

            {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
            {error   && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

            {!loading && !error && requests.length === 0 && (
                <div style={page.emptyBox}>
                    <span style={{ fontSize: 36, opacity: 0.3 }}>🔍</span>
                    <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
                        No pending requests right now. Check back soon.
                    </p>
                </div>
            )}

            {!loading && requests.length > 0 && (
                <div style={s.list}>
                    {requests.map(r => {
                        const um = urgencyMeta(r.urgency);
                        return (
                            <div key={r.id} style={page.card}>
                                <div style={s.row}>

                                    <div style={page.bloodCircle}>
                                        {bloodTypeNameStringToLabel(r.bloodTypeName ?? "")}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={s.title}>
                                            {/* TODO: BACKEND – r.address is the seeker's location */}
                                            {r.address ?? "Location not provided"}
                                        </div>
                                        <div style={s.meta}>
                                            <span style={page.statusChip(um.bg, um.color)}>
                                                {um.label} urgency
                                            </span>
                                            <span style={s.detail}>
                                                {r.quantity ?? "?"} unit(s) needed
                                            </span>
                                            {r.neededByDate && (
                                                <span style={s.detail}>
                                                    · Needed by {fmtDate(r.neededByDate)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={s.createdAt}>
                                            Posted {fmtDate(r.createdAt)}
                                        </div>
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

const s = {
    infoBanner: {
        display:      "flex",
        alignItems:   "flex-start",
        gap:          12,
        padding:      "12px 16px",
        background:   "#eff6ff",
        border:       "1px solid #bfdbfe",
        borderRadius: 10,
        marginBottom: 24,
    },
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    row: {
        display:    "flex",
        alignItems: "center",
        gap:        14,
    },
    title: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 4,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    },
    meta: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
        flexWrap:   "wrap" as const,
        marginBottom: 2,
    },
    detail: {
        fontSize: 12,
        color:    "#64748b",
    },
    createdAt: {
        fontSize: 11,
        color:    "#94a3b8",
    },
};
