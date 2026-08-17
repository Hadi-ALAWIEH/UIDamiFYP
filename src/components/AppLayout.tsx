import React from "react";
import { Link, useLocation } from "react-router-dom";
import { logout } from "../auth/Keycloak.ts";
import { useUser } from "../context/UserContext.tsx";
import { useConversations } from "../context/useConversations.ts";
import { getRoleBadgeStyle, getRoleLabel } from "../utils/roles";
import { BadgeTier, BADGE_META } from "../types";

// ── Nav item definition ────────────────────────────────────────────────────

interface NavItem {
    icon:   string;
    label:  string;
    to:     string;
    show:   boolean;
    badge?: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const { profile, isDonor, isSeeker, clearProfile } = useUser();
    const { unreadCount } = useConversations();

    const displayName = profile?.name ?? "User";
    const roleBadge   = getRoleBadgeStyle(profile?.businessRole ?? 0);
    const roleLabel   = getRoleLabel(profile?.businessRole ?? 0);
    const apiBase     = import.meta.env.VITE_API_URL ?? "https://localhost:7212";
    const avatarUrl   = profile?.profilePictureUrl
        ? `${apiBase}${profile.profilePictureUrl}`
        : null;

    // The `show` flag gates items by role so only relevant pages appear.
    // Blood Availability requires CanViewBloodAvailabilityPredictions (Seeker, ManageAccount).
    const navItems: NavItem[] = [
        { icon: "🏠", label: "Dashboard",            to: "/dashboard",          show: true      },
        { icon: "📋", label: "My Requests",           to: "/requests",           show: isSeeker  },
        { icon: "🎯", label: "Find Donors",           to: "/candidates",         show: isSeeker  },
        { icon: "🔬", label: "Blood Availability",    to: "/predict",            show: isSeeker  },
        { icon: "📌", label: "My Posts",              to: "/posts",              show: isDonor   },
        { icon: "🔍", label: "Available Requests",    to: "/available-requests", show: isDonor   },
        { icon: "💬", label: "Conversations",         to: "/conversations",      show: true, badge: unreadCount },
        { icon: "🤖", label: "Ask our bot",           to: "/ask-bot",            show: true      },
        { icon: "⚙️", label: "Account Settings",      to: "/account",            show: true      },
    ];

    function handleLogout() {
        clearProfile();
        logout();
    }

    return (
        <div style={s.shell}>

            {/* ── Sidebar ── */}
            <aside style={s.sidebar}>

                {/* Brand */}
                <div style={s.logoRow}>
                    <span style={{ fontSize: 24 }}>🩸</span>
                    <span style={s.logoText}>DamiFYP</span>
                </div>

                {/* User card */}
                <div style={s.userCard}>
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={displayName}
                            style={s.avatarImg}
                        />
                    ) : (
                        <div style={s.avatar}>
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div style={s.userInfo}>
                        <div style={s.userName}>{displayName}</div>
                        <span style={{ ...s.rolePill, ...roleBadge }}>{roleLabel}</span>
                        {(() => {
                            const tier = profile?.badgeTier ?? BadgeTier.Newcomer;
                            const m = BADGE_META[tier];
                            return (
                                <span style={{
                                    display:      "inline-block",
                                    marginTop:    4,
                                    background:   m.bg,
                                    color:        m.color,
                                    borderRadius: 99,
                                    padding:      "2px 9px",
                                    fontSize:     10,
                                    fontWeight:   700,
                                    letterSpacing: "0.02em",
                                }}>
                                    {m.emoji} {m.label}
                                </span>
                            );
                        })()}
                    </div>
                </div>

                <div style={s.sep} />

                {/* Navigation */}
                <nav style={s.nav}>
                    {navItems.filter(n => n.show).map(item => {
                        const active = location.pathname === item.to;
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                style={active
                                    ? { ...s.navLink, ...s.navLinkActive }
                                    : s.navLink}
                            >
                                <span style={s.navIcon}>{item.icon}</span>
                                <span style={s.navLabel}>{item.label}</span>
                                {!!item.badge && (
                                    <span style={s.navBadge}>
                                        {item.badge > 9 ? "9+" : item.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div style={{ flex: 1 }} />
                <div style={s.sep} />

                <button style={s.logoutBtn} onClick={handleLogout}>
                    ⏻ &nbsp;Log Out
                </button>

            </aside>

            {/* ── Page content ── */}
            <main style={s.main}>
                {children}
            </main>

        </div>
    );
}

// ── Shared styles used by every page via AppLayout ─────────────────────────

const SIDEBAR_W = 240;

const s = {
    shell: {
        position:   "fixed" as const,
        inset:      0,
        display:    "flex",
        fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
        background: [
            "radial-gradient(ellipse at 78% 5%,  rgba(198,40,40,0.18)  0%, transparent 50%)",
            "radial-gradient(ellipse at 15% 95%, rgba(124,58,237,0.09) 0%, transparent 48%)",
            "linear-gradient(160deg, #fff0f0 0%, #f8fafc 50%, #f4f0ff 100%)",
        ].join(", "),
        overflow:   "hidden",
    },
    sidebar: {
        width:         SIDEBAR_W,
        minWidth:      SIDEBAR_W,
        background:    "linear-gradient(180deg, #5c0f0f 0%, #7f1d1d 55%, #6b1414 100%)",
        display:       "flex",
        flexDirection: "column" as const,
        padding:       "22px 0 18px",
        boxShadow:     "2px 0 24px rgba(127,29,29,0.35), inset -1px 0 0 rgba(255,255,255,0.06)",
        overflow:      "hidden",
    },
    logoRow: {
        display:    "flex",
        alignItems: "center",
        gap:        10,
        padding:    "0 20px 18px",
    },
    logoText: {
        color:         "#fff",
        fontWeight:    700,
        fontSize:      20,
        letterSpacing: "-0.4px",
    },
    userCard: {
        margin:       "0 12px",
        padding:      "12px",
        background:   "rgba(255,255,255,0.1)",
        borderRadius: 10,
        display:      "flex",
        alignItems:   "flex-start",
        gap:          10,
        border:       "1px solid rgba(255,255,255,0.08)",
    },
    avatar: {
        width:          38,
        height:         38,
        borderRadius:   "50%",
        background:     "#c62828",
        border:         "2px solid rgba(255,255,255,0.25)",
        color:          "#fff",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       16,
        flexShrink:     0,
    },
    avatarImg: {
        width:        38,
        height:       38,
        borderRadius: "50%",
        border:       "2px solid rgba(255,255,255,0.25)",
        objectFit:    "cover" as const,
        flexShrink:   0,
    },
    userInfo: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           5,
        minWidth:      0,
    },
    userName: {
        color:      "#fff",
        fontWeight: 600,
        fontSize:   13,
        overflow:   "hidden",
        textOverflow:"ellipsis",
        whiteSpace: "nowrap" as const,
    },
    rolePill: {
        display:      "inline-block",
        fontSize:     10,
        fontWeight:   600,
        padding:      "2px 7px",
        borderRadius: 99,
        lineHeight:   "1.6",
    },
    sep: {
        height:     1,
        background: "rgba(255,255,255,0.1)",
        margin:     "14px 0",
    },
    nav: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           2,
        padding:       "0 10px",
    },
    navLink: {
        display:        "flex",
        alignItems:     "center",
        gap:            9,
        padding:        "9px 12px",
        borderRadius:   7,
        color:          "rgba(255,255,255,0.65)",
        textDecoration: "none",
        fontSize:       13.5,
        fontWeight:     500,
    },
    navLinkActive: {
        background: "rgba(255,255,255,0.16)",
        color:      "#fff",
        fontWeight: 600,
    },
    navIcon: {
        fontSize:  15,
        width:     20,
        textAlign: "center" as const,
    },
    navLabel: {
        flex: 1,
    },
    navBadge: {
        minWidth:       18,
        height:         18,
        padding:        "0 5px",
        borderRadius:   9,
        background:     "#ef4444",
        color:          "#fff",
        fontSize:       10.5,
        fontWeight:     700,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
    },
    logoutBtn: {
        margin:      "0 12px",
        padding:     "9px 13px",
        background:  "rgba(255,255,255,0.08)",
        border:      "1px solid rgba(255,255,255,0.1)",
        borderRadius:7,
        color:       "rgba(255,255,255,0.65)",
        fontSize:    13.5,
        cursor:      "pointer",
        fontFamily:  "inherit",
        textAlign:   "left" as const,
    },
    main: {
        flex:            1,
        overflow:        "auto",
        padding:         "32px 36px",
        backgroundImage: [
            "radial-gradient(circle, rgba(198,40,40,0.055) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "28px 28px",
    },
};

// ── Page-level style helpers (imported by child pages) ─────────────────────
// These are exported so every page can share consistent inner-content styles.

export const page = {
    topBar: {
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   28,
    } as React.CSSProperties,

    title: {
        margin:     0,
        fontSize:   22,
        fontWeight: 700,
        color:      "#1e293b",
    } as React.CSSProperties,

    subtitle: {
        margin:   "4px 0 0",
        color:    "#64748b",
        fontSize: 14,
    } as React.CSSProperties,

    section: {
        marginBottom: 28,
    } as React.CSSProperties,

    sectionHeader: {
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   12,
    } as React.CSSProperties,

    sectionTitle: {
        margin:     0,
        fontSize:   15,
        fontWeight: 600,
        color:      "#1e293b",
    } as React.CSSProperties,

    card: {
        background:   "#fff",
        borderRadius: 12,
        padding:      "16px 20px",
        boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
    } as React.CSSProperties,

    emptyBox: {
        background:     "#fff",
        borderRadius:   12,
        padding:        "36px 20px",
        boxShadow:      "0 1px 4px rgba(0,0,0,0.06)",
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        gap:            8,
    } as React.CSSProperties,

    primaryBtn: {
        padding:      "10px 20px",
        background:   "#c62828",
        color:        "#fff",
        border:       "none",
        borderRadius: 8,
        fontSize:     14,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
    } as React.CSSProperties,

    secondaryBtn: {
        padding:      "10px 20px",
        background:   "#f1f5f9",
        color:        "#334155",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     14,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
    } as React.CSSProperties,

    dangerBtn: {
        padding:      "8px 16px",
        background:   "#fff",
        color:        "#dc2626",
        border:       "1px solid #fecaca",
        borderRadius: 8,
        fontSize:     13,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
    } as React.CSSProperties,

    input: {
        padding:      "10px 12px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     14,
        fontFamily:   "inherit",
        color:        "#1e293b",
        background:   "#fff",
        width:        "100%",
        boxSizing:    "border-box" as const,
    } as React.CSSProperties,

    label: {
        fontSize:     13,
        fontWeight:   600,
        color:        "#374151",
        display:      "block",
        marginBottom: 5,
    } as React.CSSProperties,

    formRow: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           4,
    } as React.CSSProperties,

    statusChip: (bg: string, color: string) => ({
        fontSize:     11,
        fontWeight:   600,
        padding:      "3px 10px",
        borderRadius: 99,
        background:   bg,
        color,
        whiteSpace:   "nowrap" as const,
        flexShrink:   0,
    }) as React.CSSProperties,

    bloodCircle: {
        width:          44,
        height:         44,
        borderRadius:   "50%",
        background:     "#fee2e2",
        color:          "#991b1b",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       12,
        flexShrink:     0,
        border:         "2px solid #fecaca",
    } as React.CSSProperties,
};
