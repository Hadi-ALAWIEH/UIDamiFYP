import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { useUser } from "../context/UserContext.tsx";
import { useConversations } from "../context/useConversations.ts";
import { getMyDonationRequests } from "../api/donationRequests";
import { getMyDonationPosts } from "../api/donationPosts";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import {
    type DonationRequestViewModel,
    type DonationPostCandidateViewModel,
    DonationRequestStatus,
    DonationRequestUrgency,
} from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function requestStatusMeta(status: DonationRequestStatus) {
    switch (status) {
        case DonationRequestStatus.Pending:   return { bg: "#fef9c3", color: "#854d0e", label: "Pending"   };
        case DonationRequestStatus.Matched:   return { bg: "#dbeafe", color: "#1e40af", label: "Matched"   };
        case DonationRequestStatus.Completed: return { bg: "#dcfce7", color: "#166534", label: "Completed" };
        case DonationRequestStatus.Cancelled: return { bg: "#fee2e2", color: "#991b1b", label: "Cancelled" };
        default:                              return { bg: "#f3f4f6", color: "#374151", label: "Unknown"   };
    }
}

function urgencyMeta(u: DonationRequestUrgency) {
    switch (u) {
        case DonationRequestUrgency.High:   return { bg: "#fee2e2", color: "#991b1b", label: "High"   };
        case DonationRequestUrgency.Medium: return { bg: "#fef3c7", color: "#92400e", label: "Medium" };
        default:                            return { bg: "#f3f4f6", color: "#374151", label: "Low"    };
    }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Dashboard() {
    const { profile, profileLoading, isDonor, isSeeker } = useUser();
    const { conversations, unreadCount } = useConversations();

    const [requests,      setRequests]      = useState<DonationRequestViewModel[]>([]);
    const [posts,         setPosts]         = useState<DonationPostCandidateViewModel[]>([]);
    const [requestsError, setRequestsError] = useState<string | null>(null);
    const [postsError,    setPostsError]    = useState<string | null>(null);

    // Fetch seeker's requests
    useEffect(() => {
        if (!isSeeker) return;
        getMyDonationRequests()
            .then(setRequests)
            .catch(err => setRequestsError(err instanceof Error ? err.message : "Failed to load requests."));
    }, [isSeeker]);

    // Fetch donor's posts — GET /api/donationpost/get-current-user-donation-posts
    useEffect(() => {
        if (!isDonor) return;
        getMyDonationPosts()
            .then(setPosts)
            .catch(err => setPostsError(err instanceof Error ? err.message : "Failed to load posts."));
    }, [isDonor]);

    // Computed stats
    const pendingCount = requests.filter(r => r.status === DonationRequestStatus.Pending).length;

    const firstName = (profile?.name ?? "User").split(" ")[0];

    return (
        <AppLayout>

            {/* Top bar */}
            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>Dashboard</h2>
                    <p style={page.subtitle}>
                        {profileLoading ? "Loading…" : `Welcome back, ${firstName} 👋`}
                    </p>
                </div>

                {/* Availability badge — donors only */}
                {isDonor && !profileLoading && (
                    <div style={{
                        ...s.availBadge,
                        background: profile?.isAvailable ? "#dcfce7" : "#f3f4f6",
                        color:      profile?.isAvailable ? "#166534" : "#374151",
                        border:     `1px solid ${profile?.isAvailable ? "#bbf7d0" : "#d1d5db"}`,
                    }}>
                        {/* TODO: BACKEND – Wire this to a toggle endpoint when available */}
                        <span style={{
                            width:  8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                            background: profile?.isAvailable ? "#16a34a" : "#9ca3af",
                        }} />
                        {profile?.isAvailable ? "Available to Donate" : "Not Available"}
                    </div>
                )}
            </header>

            {/* ── User info card (always visible) ── */}
            {!profileLoading && profile && (
                <div style={s.infoCard}>
                    <div style={s.infoItem}>
                        <span style={s.infoLabel}>Name</span>
                        <span style={s.infoValue}>{profile.name}</span>
                    </div>
                    <div style={s.infoItem}>
                        <span style={s.infoLabel}>Email</span>
                        <span style={s.infoValue}>{profile.email}</span>
                    </div>
                    {/* bloodTypeName comes from GET /api/GetUserProfile as a string like "APositive" */}
                    {profile.bloodTypeName && (
                        <div style={s.infoItem}>
                            <span style={s.infoLabel}>Blood Type</span>
                            <span style={{ ...s.infoValue, ...s.bloodBadge }}>
                                {bloodTypeNameStringToLabel(profile.bloodTypeName)}
                            </span>
                        </div>
                    )}
                    {profile.createdAt && (
                        <div style={s.infoItem}>
                            <span style={s.infoLabel}>Member Since</span>
                            <span style={s.infoValue}>{fmtDate(profile.createdAt)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* ── Seeker stats ── */}
            {isSeeker && (
                <section style={s.statsGrid}>
                    <StatCard icon="📋" value={requests.length} label="Total Requests" accent="#c62828" />
                    <StatCard icon="⏳" value={pendingCount}    label="Pending"        accent="#d97706" />
                </section>
            )}

            {/* ── Donor stats ── */}
            {isDonor && (
                <section style={s.statsGrid}>
                    <StatCard icon="📌" value={posts.length} label="Donation Posts" accent="#c62828" />
                </section>
            )}

            {/* ── Conversations stat — shown once for all roles ── */}
            {(isDonor || isSeeker) && (
                <section style={{ ...s.statsGrid, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                    <StatCard
                        icon="💬"
                        value={conversations.length}
                        label="Conversations"
                        accent="#7c3aed"
                        badge={unreadCount > 0 ? unreadCount : undefined}
                    />
                </section>
            )}

            {/* ── Recent Requests (seekers) ── */}
            {isSeeker && (
                <section style={page.section}>
                    <div style={page.sectionHeader}>
                        <h3 style={page.sectionTitle}>Recent Donation Requests</h3>
                        <Link to="/requests" style={s.viewAll}>View All →</Link>
                    </div>

                    {requestsError && <p style={s.errText}>{requestsError}</p>}

                    {!requestsError && requests.length === 0 && (
                        <div style={page.emptyBox}>
                            <span style={{ fontSize: 32, opacity: 0.3 }}>📋</span>
                            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>No donation requests yet.</p>
                            <Link to="/requests" style={s.viewAll}>Create your first request →</Link>
                        </div>
                    )}

                    {requests.length > 0 && (
                        <div style={s.list}>
                            {/* Show latest 3 on dashboard; go to /requests for the full list */}
                            {requests.slice(0, 3).map(r => (
                                <RequestRow key={r.id} request={r} />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* ── Recent Posts (donors) ── */}
            {isDonor && (
                <section style={page.section}>
                    <div style={page.sectionHeader}>
                        <h3 style={page.sectionTitle}>My Donation Posts</h3>
                        <Link to="/posts" style={s.viewAll}>View All →</Link>
                    </div>

                    {postsError && <p style={s.errText}>{postsError}</p>}

                    {!postsError && posts.length === 0 && (
                        <div style={page.emptyBox}>
                            <span style={{ fontSize: 32, opacity: 0.3 }}>📌</span>
                            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>No donation posts yet.</p>
                            <Link to="/posts" style={s.viewAll}>Create your first post →</Link>
                        </div>
                    )}

                    {posts.length > 0 && (
                        <div style={s.list}>
                            {/* bloodTypeName is a string from backend ("APositive" etc.) */}
                            {posts.slice(0, 3).map((p, i) => (
                                <PostRow key={p.donationPostId || i} post={p} />
                            ))}
                        </div>
                    )}
                </section>
            )}

        </AppLayout>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon, value, label, accent, badge }: {
    icon: string; value: number; label: string; accent: string; badge?: number;
}) {
    return (
        <div style={{ ...s.statCard, borderTopColor: accent }}>
            <div style={{ position: "relative", display: "inline-flex" }}>
                <div style={{ ...s.statIcon, background: accent + "18" }}>
                    <span style={{ fontSize: 20 }}>{icon}</span>
                </div>
                {badge != null && (
                    <span style={{
                        position:     "absolute",
                        top:          -4,
                        right:        -4,
                        minWidth:     18,
                        height:       18,
                        borderRadius: 99,
                        background:   "#c62828",
                        color:        "#fff",
                        fontSize:     10,
                        fontWeight:   700,
                        display:      "flex",
                        alignItems:   "center",
                        justifyContent: "center",
                        padding:      "0 4px",
                        border:       "2px solid #fff",
                    }}>
                        {badge}
                    </span>
                )}
            </div>
            <div style={s.statValue}>{value}</div>
            <div style={s.statLabel}>{label}</div>
        </div>
    );
}

function RequestRow({ request }: { request: DonationRequestViewModel }) {
    const sm = requestStatusMeta(request.status);
    const um = urgencyMeta(request.urgency);
    return (
        <div style={s.row}>
            {/* bloodTypeName is a string from backend — use the string→label helper */}
            <div style={page.bloodCircle}>
                {bloodTypeNameStringToLabel(request.bloodTypeName ?? "")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{request.address ?? "No address provided"}</div>
                <div style={s.rowMeta}>
                    <span style={page.statusChip(um.bg, um.color)}>{um.label} urgency</span>
                    {request.neededByDate && (
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            Needed by {fmtDate(request.neededByDate)}
                        </span>
                    )}
                </div>
            </div>
            <span style={page.statusChip(sm.bg, sm.color)}>{sm.label}</span>
        </div>
    );
}

function PostRow({ post }: { post: DonationPostCandidateViewModel }) {
    return (
        <div style={s.row}>
            {/* bloodTypeName is a string from backend */}
            <div style={page.bloodCircle}>
                {bloodTypeNameStringToLabel(post.bloodTypeName ?? "")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>
                    {/* TODO: BACKEND – add location/address field to the my-posts response */}
                    {post.donorAddress || "No location set"}
                </div>
                <div style={s.rowMeta}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                        {post.quantity ?? "?"} unit(s) available
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
    availBadge: {
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        padding:      "8px 14px",
        borderRadius: 99,
        fontSize:     13,
        fontWeight:   600,
    },
    infoCard: {
        background:   "#fff",
        borderRadius: 12,
        padding:      "16px 20px",
        boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
        display:      "flex",
        flexWrap:     "wrap" as const,
        gap:          "12px 32px",
        marginBottom: 24,
    },
    infoItem: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           2,
    },
    infoLabel: {
        fontSize:   11,
        fontWeight: 600,
        color:      "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
    },
    infoValue: {
        fontSize:   14,
        fontWeight: 500,
        color:      "#1e293b",
    },
    bloodBadge: {
        display:      "inline-block",
        background:   "#fee2e2",
        color:        "#991b1b",
        fontWeight:   700,
        padding:      "2px 10px",
        borderRadius: 99,
        fontSize:     13,
        border:       "1px solid #fecaca",
    },
    statsGrid: {
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap:                 14,
        marginBottom:        24,
    },
    statCard: {
        background:    "#fff",
        borderRadius:  12,
        padding:       "18px 14px",
        borderTop:     "3px solid",
        boxShadow:     "0 1px 4px rgba(0,0,0,0.06)",
        display:       "flex",
        flexDirection: "column" as const,
        alignItems:    "center",
        gap:           7,
    },
    statIcon: {
        width:          44,
        height:         44,
        borderRadius:   "50%",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
    },
    statValue: {
        fontSize:   28,
        fontWeight: 700,
        color:      "#1e293b",
        lineHeight: "1",
    },
    statLabel: {
        fontSize:   11,
        color:      "#64748b",
        fontWeight: 500,
        textAlign:  "center" as const,
    },
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    row: {
        background:   "#fff",
        borderRadius: 10,
        padding:      "14px 16px",
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
    },
    rowTitle: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 4,
        whiteSpace:   "nowrap" as const,
        overflow:     "hidden",
        textOverflow: "ellipsis",
    },
    rowMeta: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
        flexWrap:   "wrap" as const,
    },
    viewAll: {
        color:          "#c62828",
        textDecoration: "none",
        fontSize:       13,
        fontWeight:     600,
    },
    errText: { color: "#dc2626", fontSize: 13 },
};
