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

    useEffect(() => {
        if (!isSeeker) return;
        getMyDonationRequests()
            .then(setRequests)
            .catch(err => setRequestsError(err instanceof Error ? err.message : "Failed to load requests."));
    }, [isSeeker]);

    useEffect(() => {
        if (!isDonor) return;
        getMyDonationPosts()
            .then(setPosts)
            .catch(err => setPostsError(err instanceof Error ? err.message : "Failed to load posts."));
    }, [isDonor]);

    const pendingCount = requests.filter(r => r.status === DonationRequestStatus.Pending).length;
    const firstName = (profile?.name ?? "User").split(" ")[0];

    // Build one unified array of stat cards based on the user's role
    const statCards: Array<{
        icon: string; value: number; label: string;
        accent: string; accentDark: string; badge?: number;
    }> = [];
    if (isSeeker) {
        statCards.push({ icon: "📋", value: requests.length, label: "Total Requests", accent: "#c62828", accentDark: "#7f1d1d" });
        statCards.push({ icon: "⏳", value: pendingCount,    label: "Pending",         accent: "#d97706", accentDark: "#92400e" });
    }
    if (isDonor) {
        statCards.push({ icon: "🩸", value: posts.length,   label: "Donation Posts",  accent: "#059669", accentDark: "#065f46" });
    }
    if (isDonor || isSeeker) {
        statCards.push({
            icon: "💬", value: conversations.length, label: "Conversations",
            accent: "#7c3aed", accentDark: "#4c1d95",
            badge: unreadCount > 0 ? unreadCount : undefined,
        });
    }

    return (
        <AppLayout>

            {/* Hero banner replaces the plain topBar header */}
            {!profileLoading && (
                <HeroBanner
                    name={firstName}
                    isDonor={isDonor}
                    isSeeker={isSeeker}
                    isAvailable={profile?.isAvailable}
                />
            )}

            {/* Unified stat cards — all roles in one grid */}
            {statCards.length > 0 && (
                <section style={s.statsGrid}>
                    {statCards.map((card, i) => <StatCard key={i} {...card} />)}
                </section>
            )}

            {/* Profile summary strip */}
            {!profileLoading && profile && (
                <div style={s.infoCard}>
                    <div style={s.infoCardTitle}>Your Profile</div>
                    <div style={s.infoCardGrid}>
                        <div style={s.infoItem}>
                            <span style={s.infoLabel}>Name</span>
                            <span style={s.infoValue}>{profile.name}</span>
                        </div>
                        <div style={s.infoItem}>
                            <span style={s.infoLabel}>Email</span>
                            <span style={s.infoValue}>{profile.email}</span>
                        </div>
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
                </div>
            )}

            {/* Recent Requests (seekers) */}
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
                            {requests.slice(0, 3).map(r => <RequestRow key={r.id} request={r} />)}
                        </div>
                    )}
                </section>
            )}

            {/* Recent Posts (donors) */}
            {isDonor && (
                <section style={page.section}>
                    <div style={page.sectionHeader}>
                        <h3 style={page.sectionTitle}>My Donation Posts</h3>
                        <Link to="/posts" style={s.viewAll}>View All →</Link>
                    </div>

                    {postsError && <p style={s.errText}>{postsError}</p>}

                    {!postsError && posts.length === 0 && (
                        <div style={page.emptyBox}>
                            <span style={{ fontSize: 32, opacity: 0.3 }}>🩸</span>
                            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>No donation posts yet.</p>
                            <Link to="/posts" style={s.viewAll}>Create your first post →</Link>
                        </div>
                    )}

                    {posts.length > 0 && (
                        <div style={s.list}>
                            {posts.slice(0, 3).map((p, i) => <PostRow key={p.donationPostId || i} post={p} />)}
                        </div>
                    )}
                </section>
            )}

        </AppLayout>
    );
}

// ── Hero Banner ────────────────────────────────────────────────────────────

function HeroBanner({ name, isDonor, isSeeker, isAvailable }: {
    name: string; isDonor: boolean; isSeeker: boolean; isAvailable?: boolean;
}) {
    const roleText = isDonor && isSeeker ? "Donor & Seeker" : isDonor ? "Blood Donor" : "Blood Seeker";
    return (
        <div style={s.heroBanner}>
            <div style={s.heroCircle1} />
            <div style={s.heroCircle2} />

            <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
                <p style={s.heroGreeting}>Welcome back</p>
                <h2 style={s.heroName}>{name}</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <span style={s.heroRoleBadge}>{roleText}</span>
                    {isDonor && (
                        <span style={{
                            ...s.heroRoleBadge,
                            background: isAvailable ? "rgba(187,247,208,0.25)" : "rgba(255,255,255,0.12)",
                            border:     `1px solid ${isAvailable ? "rgba(187,247,208,0.5)" : "rgba(255,255,255,0.2)"}`,
                        }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: "50%",
                                background: isAvailable ? "#86efac" : "rgba(255,255,255,0.45)",
                                display: "inline-block", marginRight: 5,
                            }} />
                            {isAvailable ? "Available to Donate" : "Not Available"}
                        </span>
                    )}
                </div>
            </div>

            <div style={{ position: "relative", zIndex: 1, flexShrink: 0, display: "flex", alignItems: "center" }}>
                <BloodDonationIllustration />
            </div>
        </div>
    );
}

function BloodDonationIllustration() {
    return (
        <svg width="180" height="140" viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Large blood drop */}
            <path d="M90 8 C90 8 50 62 50 88 C50 110.4 68.6 126 90 126 C111.4 126 130 110.4 130 88 C130 62 90 8 90 8Z" fill="rgba(255,255,255,0.2)" />
            {/* Inner shine */}
            <path d="M72 58 C72 58 63 78 63 90 C63 96 65.2 101 69 105" stroke="rgba(255,255,255,0.3)" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* Medical cross inside drop */}
            <rect x="81" y="74" width="18" height="6" rx="3" fill="rgba(255,255,255,0.65)" />
            <rect x="87" y="68" width="6" height="18" rx="3" fill="rgba(255,255,255,0.65)" />
            {/* Small drop — top right */}
            <path d="M150 28 C150 28 141 42 141 49 C141 56.2 145 61 150 61 C155 61 159 56.2 159 49 C159 42 150 28 150 28Z" fill="rgba(255,255,255,0.17)" />
            {/* Small drop — top left */}
            <path d="M32 24 C32 24 25 35 25 41 C25 47 28.3 51 32 51 C35.7 51 39 47 39 41 C39 35 32 24 32 24Z" fill="rgba(255,255,255,0.17)" />
            {/* Heartbeat line */}
            <polyline points="0,128 22,128 32,110 41,140 51,115 62,128 180,128" stroke="rgba(255,255,255,0.28)" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {/* Sparkle dots */}
            <circle cx="162" cy="12" r="3" fill="rgba(255,255,255,0.4)" />
            <circle cx="172" cy="30" r="2" fill="rgba(255,255,255,0.3)" />
            <circle cx="12"  cy="68" r="2.5" fill="rgba(255,255,255,0.3)" />
            <circle cx="22"  cy="48" r="1.5" fill="rgba(255,255,255,0.25)" />
            <circle cx="168" cy="55" r="1.5" fill="rgba(255,255,255,0.2)" />
        </svg>
    );
}

// ── StatCard ───────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, accent, accentDark, badge }: {
    icon: string; value: number; label: string; accent: string; accentDark: string; badge?: number;
}) {
    return (
        <div style={{
            ...s.statCard,
            background: `linear-gradient(135deg, ${accentDark} 0%, ${accent} 100%)`,
            boxShadow:  `0 8px 24px ${accent}45`,
        }}>
            <div style={s.statCardDecor1} />
            <div style={s.statCardDecor2} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 26 }}>{icon}</span>
                    {badge != null && <span style={s.badgeChip}>{badge} new</span>}
                </div>
                <div style={s.statValue}>{value}</div>
                <div style={s.statLabel}>{label}</div>
            </div>
        </div>
    );
}

// ── Row sub-components ─────────────────────────────────────────────────────

function RequestRow({ request }: { request: DonationRequestViewModel }) {
    const sm = requestStatusMeta(request.status);
    const um = urgencyMeta(request.urgency);
    return (
        <div style={s.row}>
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
            <div style={page.bloodCircle}>
                {bloodTypeNameStringToLabel(post.bloodTypeName ?? "")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{post.donorAddress || "No location set"}</div>
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
    heroBanner: {
        background:     "linear-gradient(135deg, #7f1d1d 0%, #c62828 55%, #991b1b 100%)",
        borderRadius:   16,
        padding:        "28px 32px",
        marginBottom:   24,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        overflow:       "hidden",
        position:       "relative" as const,
        minHeight:      140,
        gap:            16,
    },
    heroCircle1: {
        position:      "absolute" as const,
        top:           -40,
        right:         140,
        width:         180,
        height:        180,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.07)",
        pointerEvents: "none" as const,
    },
    heroCircle2: {
        position:      "absolute" as const,
        bottom:        -60,
        left:          -30,
        width:         200,
        height:        200,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.05)",
        pointerEvents: "none" as const,
    },
    heroGreeting: {
        color:         "rgba(255,255,255,0.72)",
        fontSize:      13,
        margin:        "0 0 4px",
        fontWeight:    500,
        letterSpacing: "0.3px",
    },
    heroName: {
        color:         "#fff",
        fontSize:      26,
        fontWeight:    800,
        margin:        "0 0 12px",
        letterSpacing: "-0.3px",
    },
    heroRoleBadge: {
        display:       "inline-flex",
        alignItems:    "center",
        background:    "rgba(255,255,255,0.18)",
        border:        "1px solid rgba(255,255,255,0.3)",
        color:         "#fff",
        padding:       "4px 12px",
        borderRadius:  99,
        fontSize:      12,
        fontWeight:    600,
        letterSpacing: "0.2px",
    },
    statsGrid: {
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
        gap:                 16,
        marginBottom:        24,
    },
    statCard: {
        borderRadius: 14,
        padding:      "20px 18px",
        overflow:     "hidden",
        position:     "relative" as const,
    },
    statCardDecor1: {
        position:      "absolute" as const,
        top:           -20,
        right:         -20,
        width:         90,
        height:        90,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.12)",
        pointerEvents: "none" as const,
    },
    statCardDecor2: {
        position:      "absolute" as const,
        bottom:        -30,
        left:          -10,
        width:         80,
        height:        80,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.07)",
        pointerEvents: "none" as const,
    },
    statValue: {
        fontSize:      36,
        fontWeight:    800,
        color:         "#fff",
        lineHeight:    "1",
        letterSpacing: "-0.5px",
    },
    statLabel: {
        fontSize:      11,
        color:         "rgba(255,255,255,0.82)",
        fontWeight:    600,
        letterSpacing: "0.4px",
        textTransform: "uppercase" as const,
    },
    badgeChip: {
        background:   "rgba(255,255,255,0.25)",
        color:        "#fff",
        borderRadius: 99,
        fontSize:     10,
        fontWeight:   700,
        padding:      "2px 8px",
        border:       "1px solid rgba(255,255,255,0.35)",
    },
    infoCard: {
        background:   "#fff",
        borderRadius: 12,
        padding:      "18px 20px",
        boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
        marginBottom: 24,
        border:       "1px solid #f1f5f9",
    },
    infoCardTitle: {
        fontSize:     13,
        fontWeight:   700,
        color:        "#1e293b",
        marginBottom: 14,
    },
    infoCardGrid: {
        display:  "flex",
        flexWrap: "wrap" as const,
        gap:      "12px 32px",
    },
    infoItem: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           3,
    },
    infoLabel: {
        fontSize:      11,
        fontWeight:    600,
        color:         "#94a3b8",
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
        border:       "1px solid #f1f5f9",
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
