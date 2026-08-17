import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { getMyDonationRequests, confirmMatch } from "../api/donationRequests";
import { getCandidatesForRequest } from "../api/donationRequests";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import {
    DonationRequestStatus,
    DonationRequestUrgency,
    BadgeTier,
    BADGE_META,
    type DonationRequestViewModel,
    type DonationPostCandidateViewModel,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function urgencyMeta(u: DonationRequestUrgency) {
    switch (u) {
        case DonationRequestUrgency.High:   return { label: "High",   bg: "#fee2e2", color: "#991b1b" };
        case DonationRequestUrgency.Medium: return { label: "Medium", bg: "#fef3c7", color: "#92400e" };
        default:                            return { label: "Low",    bg: "#f3f4f6", color: "#374151" };
    }
}

function urgencyBorderColor(u: DonationRequestUrgency): string {
    switch (u) {
        case DonationRequestUrgency.High:   return "#c62828";
        case DonationRequestUrgency.Medium: return "#d97706";
        default:                            return "#94a3b8";
    }
}

function statusMeta(s: DonationRequestStatus) {
    switch (s) {
        case DonationRequestStatus.Pending:   return { label: "Pending",   bg: "#fef9c3", color: "#854d0e" };
        case DonationRequestStatus.Matched:   return { label: "Matched",   bg: "#dbeafe", color: "#1e40af" };
        case DonationRequestStatus.Completed: return { label: "Completed", bg: "#dcfce7", color: "#166534" };
        case DonationRequestStatus.Cancelled: return { label: "Cancelled", bg: "#fee2e2", color: "#991b1b" };
        default:                              return { label: "Unknown",   bg: "#f3f4f6", color: "#374151" };
    }
}

// ── Per-request slot ─────────────────────────────────────────────────────────

type Slot = {
    expanded:   boolean;
    candidates: DonationPostCandidateViewModel[] | null;  // null = not yet fetched
    loading:    boolean;
    error:      string | null;
    confirming: number | null;   // donationPostId currently being confirmed
    matchedWith: number | null;  // donationPostId that was just successfully confirmed
};

function emptySlot(): Slot {
    return { expanded: false, candidates: null, loading: false, error: null, confirming: null, matchedWith: null };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Candidates() {
    const [requests, setRequests] = useState<DonationRequestViewModel[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState<string | null>(null);
    const [slots,    setSlots]    = useState<Record<number, Slot>>({});

    const [searchParams] = useSearchParams();
    const highlightId    = searchParams.get("highlight") ? Number(searchParams.get("highlight")) : null;

    // Ref map so we can scroll the highlighted card into view once it renders.
    const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

    useEffect(() => {
        getMyDonationRequests()
            .then(data => {
                setRequests(data);
                const init: Record<number, Slot> = {};
                data.forEach(r => { init[r.id] = emptySlot(); });

                // If we arrived via ?highlight=, pre-open that request's slot
                // and immediately kick off the candidate fetch so the user sees
                // the candidates without having to click anything first.
                if (highlightId) {
                    init[highlightId] = { ...emptySlot(), expanded: true, loading: true };
                }
                setSlots(init);

                // Fetch candidates for the highlighted request right after state settles.
                if (highlightId) {
                    const req = data.find(r => r.id === highlightId);
                    if (req && req.status === DonationRequestStatus.Pending) {
                        getCandidatesForRequest(highlightId)
                            .then(result => {
                                setSlots(prev => ({
                                    ...prev,
                                    [highlightId]: { ...prev[highlightId], candidates: result.candidates, loading: false },
                                }));
                            })
                            .catch(err => {
                                setSlots(prev => ({
                                    ...prev,
                                    [highlightId]: {
                                        ...prev[highlightId],
                                        loading: false,
                                        error: err instanceof Error ? err.message : "Failed to load candidates.",
                                    },
                                }));
                            });
                    } else if (req) {
                        // Request is not pending — just expand the header for visibility.
                        init[highlightId] = { ...emptySlot(), expanded: false };
                        setSlots(init);
                    }
                }
            })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load requests."))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll the highlighted card into view once it's mounted.
    useEffect(() => {
        if (!highlightId || loading) return;
        const el = cardRefs.current[highlightId];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [loading, highlightId]);

    function patchSlot(id: number, patch: Partial<Slot>) {
        setSlots(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    }

    // Toggle accordion — on first open, fetch candidates
    async function toggleRequest(req: DonationRequestViewModel) {
        const slot = slots[req.id] ?? emptySlot();
        const opening = !slot.expanded;

        patchSlot(req.id, { expanded: opening });

        // Only fetch if opening for the first time and request is Pending
        if (opening && slot.candidates === null && req.status === DonationRequestStatus.Pending) {
            patchSlot(req.id, { loading: true, error: null });
            try {
                // GET /api/donationpost/get-candidates-{id}
                const result = await getCandidatesForRequest(req.id);
                patchSlot(req.id, { candidates: result.candidates, loading: false });
            } catch (err) {
                patchSlot(req.id, {
                    loading: false,
                    error: err instanceof Error ? err.message : "Failed to load candidates.",
                });
            }
        }
    }

    // Confirm a match between a donation request and a donation post
    async function handleConfirm(requestId: number, donationPostId: number) {
        patchSlot(requestId, { confirming: donationPostId, error: null });
        try {
            // POST /api/donationrequest/confirm-match
            await confirmMatch({ donationRequestId: requestId, donationPostId });

            // Mark the request as Matched in local state
            setRequests(prev =>
                prev.map(r =>
                    r.id === requestId
                        ? { ...r, status: DonationRequestStatus.Matched }
                        : r
                )
            );
            // Also flag this specific donor as matched within the slot's candidate
            // list — this is what GetCandidatesAsync now persists server-side too,
            // so it stays correct even if the request panel is reopened later
            // without a full reload (e.g. before navigating away).
            setSlots(prev => {
                const slot = prev[requestId];
                if (!slot?.candidates) return prev;
                return {
                    ...prev,
                    [requestId]: {
                        ...slot,
                        candidates: slot.candidates.map(c =>
                            c.donationPostId === donationPostId ? { ...c, isMatched: true } : c
                        ),
                    },
                };
            });
            patchSlot(requestId, { confirming: null, matchedWith: donationPostId, expanded: false });
        } catch (err) {
            patchSlot(requestId, {
                confirming: null,
                error: err instanceof Error ? err.message : "Failed to confirm match.",
            });
        }
    }

    const pendingCount = requests.filter(r => r.status === DonationRequestStatus.Pending).length;

    return (
        <AppLayout>

            {/* Page banner */}
            <div style={st.pageBanner}>
                <div style={st.bannerDecor1} />
                <div style={st.bannerDecor2} />
                <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
                    <h2 style={st.bannerTitle}>Find Donors</h2>
                    <p style={st.bannerSubtitle}>Click a request to see matching donors and confirm a match</p>
                    {!loading && (
                        <div style={st.bannerStats}>
                            <span style={st.statPill}>{requests.length} Request{requests.length !== 1 ? "s" : ""}</span>
                            <span style={{ ...st.statPill, background: "rgba(254,215,170,0.3)", border: "1px solid rgba(254,215,170,0.5)" }}>
                                {pendingCount} Pending
                            </span>
                        </div>
                    )}
                </div>
                <div style={{ position: "relative", zIndex: 1, flexShrink: 0, display: "flex", alignItems: "center" }}>
                    <FindDonorsIllustration />
                </div>
            </div>

            {loading && <p style={{ color: "#94a3b8" }}>Loading your requests…</p>}
            {error   && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

            {!loading && requests.length === 0 && (
                <div style={page.emptyBox}>
                    <span style={{ fontSize: 40, opacity: 0.2 }}>🔍</span>
                    <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
                        You have no donation requests yet.
                    </p>
                    <Link to="/requests" style={st.link}>
                        Create a request →
                    </Link>
                </div>
            )}

            <div style={st.list}>
                {requests.map(req => {
                    const slot  = slots[req.id] ?? emptySlot();
                    const sm    = statusMeta(req.status);
                    const um    = urgencyMeta(req.urgency);
                    const isPending = req.status === DonationRequestStatus.Pending;

                    const isHighlighted = req.id === highlightId;

                    return (
                        <div
                            key={req.id}
                            ref={el => { cardRefs.current[req.id] = el; }}
                            style={{
                                ...st.requestCard,
                                ...(isHighlighted ? st.requestCardHighlighted : {}),
                                borderLeft: `4px solid ${urgencyBorderColor(req.urgency)}`,
                            }}
                        >

                            {/* ── Request header (always visible) ── */}
                            <button
                                style={{
                                    ...st.requestHeader,
                                    cursor:       isPending ? "pointer" : "default",
                                    borderBottom: slot.expanded ? "1px solid #f1f5f9" : "none",
                                }}
                                onClick={() => isPending && toggleRequest(req)}
                            >
                                {/* Rich blood type badge */}
                                <div style={st.reqBloodBadge}>
                                    <span style={st.reqBloodText}>
                                        {bloodTypeNameStringToLabel(req.bloodTypeName ?? "")}
                                    </span>
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={st.requestTitle}>
                                        {req.address ?? "No address provided"}
                                    </div>
                                    <div style={st.requestMeta}>
                                        <span style={{ ...st.chip, background: um.bg, color: um.color }}>
                                            {um.label} urgency
                                        </span>
                                        <span style={st.chipBlue}>
                                            {req.quantity ?? "?"} unit{(req.quantity ?? 1) !== 1 ? "s" : ""}
                                        </span>
                                        {req.neededByDate && (
                                            <span style={st.chipGray}>
                                                By {fmtDate(req.neededByDate)}
                                            </span>
                                        )}
                                        <span style={st.dimText}>
                                            Posted {fmtDate(req.createdAt)}
                                        </span>
                                    </div>
                                </div>

                                <div style={st.headerRight}>
                                    <span style={page.statusChip(sm.bg, sm.color)}>{sm.label}</span>
                                    {isPending && (
                                        <span style={st.chevron}>
                                            {slot.expanded ? "▲" : "▼"}
                                        </span>
                                    )}
                                </div>
                            </button>

                            {/* ── Matched — link to conversation ── */}
                            {!isPending && req.status === DonationRequestStatus.Matched && (
                                <div style={st.matchedBanner}>
                                    <span>✅</span>
                                    <span>
                                        You have been matched for this request.
                                    </span>
                                    <Link to="/conversations" style={st.link}>
                                        Open conversation →
                                    </Link>
                                </div>
                            )}

                            {/* ── Just-confirmed success banner ── */}
                            {slot.matchedWith !== null && (
                                <div style={st.successBanner}>
                                    <span>🎉</span>
                                    <span>Match confirmed! A conversation has been created.</span>
                                    <Link to="/conversations" style={{ ...st.link, color: "#166534" }}>
                                        Open chat →
                                    </Link>
                                </div>
                            )}

                            {/* ── Error ── */}
                            {slot.error && (
                                <div style={st.errBox}>{slot.error}</div>
                            )}

                            {/* ── Candidates panel (Pending requests only) ── */}
                            {isPending && slot.expanded && (
                                <div style={st.candidatesPanel}>
                                    {slot.loading && (
                                        <p style={st.hintText}>Loading candidates…</p>
                                    )}

                                    {!slot.loading && slot.candidates !== null && slot.candidates.length === 0 && (
                                        <div style={st.noCandidates}>
                                            <span style={{ fontSize: 28, opacity: 0.2 }}>😔</span>
                                            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
                                                No available donors match this request right now.
                                                Check back later or wait for a donor to post availability.
                                            </p>
                                        </div>
                                    )}

                                    {!slot.loading && slot.candidates && slot.candidates.length > 0 && (
                                        <>
                                            <div style={st.candidatesHeader}>
                                                <span style={st.candidatesTitle}>
                                                    {slot.candidates.length} available donor{slot.candidates.length !== 1 ? "s" : ""}
                                                </span>
                                                <span style={st.candidatesHint}>
                                                    Select a donor to confirm your match. A conversation will open automatically.
                                                </span>
                                            </div>
                                            <div style={st.candidateGrid}>
                                                {slot.candidates.map(c => (
                                                    <CandidateCard
                                                        key={c.donationPostId}
                                                        candidate={c}
                                                        confirming={slot.confirming === c.donationPostId}
                                                        anyConfirming={slot.confirming !== null}
                                                        alreadyMatched={!!c.isMatched}
                                                        onConfirm={() => handleConfirm(req.id, c.donationPostId)}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

        </AppLayout>
    );
}

// ── Candidate card ────────────────────────────────────────────────────────────

const API_BASE_C = import.meta.env.VITE_API_URL ?? "https://localhost:7212";

function CandidateCard({
    candidate,
    confirming,
    anyConfirming,
    alreadyMatched,
    onConfirm,
}: {
    candidate:      DonationPostCandidateViewModel;
    confirming:     boolean;
    anyConfirming:  boolean;
    alreadyMatched: boolean;
    onConfirm:      () => void;
}) {
    const initial    = candidate.donorName?.charAt(0)?.toUpperCase() ?? "?";
    const avatarUrl  = candidate.donorProfilePictureUrl
        ? `${API_BASE_C}${candidate.donorProfilePictureUrl}`
        : null;

    return (
        <div style={st.candidateCard}>
            {/* Avatar */}
            <div style={st.candidateAvatarWrap}>
                {avatarUrl ? (
                    <img src={avatarUrl} alt={candidate.donorName} style={st.candidateAvatarImg} />
                ) : (
                    <div style={st.candidateAvatar}>
                        <div style={st.avatarDecor} />
                        <span style={st.avatarInitial}>{initial}</span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={st.candidateName}>{candidate.donorName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={st.donorBadge}>Blood Donor</span>
                    {(() => {
                        const tier = candidate.donorBadgeTier ?? BadgeTier.Newcomer;
                        const m = BADGE_META[tier];
                        return (
                            <span style={{ background: m.bg, color: m.color, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                                {m.emoji} {m.label}
                            </span>
                        );
                    })()}
                </div>
                <div style={st.candidateTags}>
                    <span style={st.bloodChip}>
                        {bloodTypeNameStringToLabel(candidate.bloodTypeName ?? "")}
                    </span>
                    <span style={st.unitsBadge}>
                        {candidate.quantity ?? "?"} unit{(candidate.quantity ?? 1) !== 1 ? "s" : ""} available
                    </span>
                </div>
                {/* Aggregate donor rating */}
                {(candidate.reviewCount ?? 0) > 0 ? (
                    <div style={st.ratingRow}>
                        <span style={st.ratingStars}>
                            {[1,2,3,4,5].map(n => (
                                <span key={n} style={{ color: n <= Math.round(candidate.averageRating ?? 0) ? "#f59e0b" : "#d1d5db" }}>★</span>
                            ))}
                        </span>
                        <span style={st.ratingText}>
                            {candidate.averageRating?.toFixed(1)} ({candidate.reviewCount} review{candidate.reviewCount !== 1 ? "s" : ""})
                        </span>
                    </div>
                ) : (
                    <div style={st.noReviews}>No reviews yet</div>
                )}
                {candidate.donorAddress && (
                    <div style={st.candidateDetail}>
                        <span style={{ opacity: 0.6 }}>📍</span>
                        {candidate.donorAddress}
                    </div>
                )}
            </div>

            {/* Action — once this donor is already matched to the request, replace
                the button entirely with a non-interactive "Matched" pill so it
                can't be confirmed again. */}
            {alreadyMatched ? (
                <div style={st.matchedPill}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Matched
                </div>
            ) : (
                <button
                    style={{ ...st.confirmBtn, opacity: anyConfirming ? 0.6 : 1 }}
                    onClick={onConfirm}
                    disabled={anyConfirming}
                >
                    {confirming ? "Confirming…" : "Confirm Match"}
                </button>
            )}
        </div>
    );
}

// ── Illustrations ─────────────────────────────────────────────────────────────

function FindDonorsIllustration() {
    return (
        <svg width="130" height="100" viewBox="0 0 130 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Magnifying glass ring */}
            <circle cx="52" cy="46" r="32" stroke="rgba(255,255,255,0.28)" strokeWidth="5" fill="rgba(255,255,255,0.08)" />
            {/* Handle */}
            <line x1="76" y1="70" x2="104" y2="96" stroke="rgba(255,255,255,0.32)" strokeWidth="7" strokeLinecap="round" />
            {/* Person head inside glass */}
            <circle cx="52" cy="36" r="9" fill="rgba(255,255,255,0.38)" />
            {/* Person body arc */}
            <path d="M30 68 Q30 52 52 52 Q74 52 74 68" fill="rgba(255,255,255,0.22)" />
            {/* Heart on chest */}
            <path d="M47 54 C47 51.2 49.4 49.5 52 52 C54.6 49.5 57 51.2 57 54 C57 56.5 52 60 52 60 C52 60 47 56.5 47 54Z" fill="rgba(255,255,255,0.65)" />
            {/* Blood drop top-right */}
            <path d="M108 18 C108 18 101 28 101 33 C101 38 104.1 41 108 41 C111.9 41 115 38 115 33 C115 28 108 18 108 18Z" fill="rgba(255,255,255,0.2)" />
            {/* Sparkles */}
            <circle cx="118" cy="12" r="2.5" fill="rgba(255,255,255,0.4)" />
            <circle cx="14" cy="75" r="2"   fill="rgba(255,255,255,0.28)" />
            <circle cx="8"  cy="38" r="1.5" fill="rgba(255,255,255,0.22)" />
            <circle cx="122" cy="55" r="1.5" fill="rgba(255,255,255,0.2)" />
        </svg>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = {
    // ── Banner ────────────────────────────────────────────────────────────────
    pageBanner: {
        background:     "linear-gradient(135deg, #7f1d1d 0%, #c62828 55%, #991b1b 100%)",
        borderRadius:   16,
        padding:        "24px 28px",
        marginBottom:   24,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        overflow:       "hidden",
        position:       "relative" as const,
        minHeight:      120,
        gap:            16,
    },
    bannerDecor1: {
        position:      "absolute" as const,
        top:           -40,
        right:         100,
        width:         160,
        height:        160,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.07)",
        pointerEvents: "none" as const,
    },
    bannerDecor2: {
        position:      "absolute" as const,
        bottom:        -50,
        left:          -20,
        width:         160,
        height:        160,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.05)",
        pointerEvents: "none" as const,
    },
    bannerTitle: {
        color:         "#fff",
        fontSize:      22,
        fontWeight:    800,
        margin:        "0 0 5px",
        letterSpacing: "-0.3px",
    },
    bannerSubtitle: {
        color:         "rgba(255,255,255,0.75)",
        fontSize:      13,
        margin:        "0 0 12px",
        fontWeight:    500,
    },
    bannerStats: {
        display:  "flex",
        gap:      8,
        flexWrap: "wrap" as const,
    },
    statPill: {
        display:      "inline-flex",
        alignItems:   "center",
        background:   "rgba(255,255,255,0.18)",
        border:       "1px solid rgba(255,255,255,0.3)",
        color:        "#fff",
        padding:      "3px 11px",
        borderRadius: 99,
        fontSize:     12,
        fontWeight:   600,
    },
    // ── List & request cards ──────────────────────────────────────────────────
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           12,
    },
    requestCard: {
        background:   "#fff",
        borderRadius: 12,
        boxShadow:    "0 2px 8px rgba(0,0,0,0.07)",
        overflow:     "hidden",
        border:       "1px solid #f1f5f9",
    },
    requestCardHighlighted: {
        boxShadow:  "0 0 0 2px #c62828, 0 4px 16px rgba(198,40,40,0.15)",
        background: "#fffafa",
    },
    requestHeader: {
        display:    "flex",
        alignItems: "center",
        gap:        14,
        width:      "100%",
        padding:    "16px 20px",
        background: "none",
        border:     "none",
        fontFamily: "inherit",
        textAlign:  "left" as const,
    },
    reqBloodBadge: {
        width:          52,
        height:         52,
        borderRadius:   12,
        background:     "linear-gradient(135deg, #7f1d1d 0%, #c62828 100%)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        boxShadow:      "0 4px 12px rgba(198,40,40,0.35)",
    },
    reqBloodText: {
        color:      "#fff",
        fontWeight: 800,
        fontSize:   13,
    },
    requestTitle: {
        fontWeight:   700,
        fontSize:     15,
        color:        "#0f172a",
        marginBottom: 6,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    },
    requestMeta: {
        display:    "flex",
        alignItems: "center",
        gap:        6,
        flexWrap:   "wrap" as const,
    },
    chip: {
        fontSize:     11,
        fontWeight:   700,
        padding:      "3px 10px",
        borderRadius: 99,
    },
    chipBlue: {
        fontSize:     11,
        fontWeight:   600,
        color:        "#1e40af",
        background:   "#dbeafe",
        padding:      "3px 10px",
        borderRadius: 99,
    },
    chipGray: {
        fontSize:     11,
        fontWeight:   500,
        color:        "#475569",
        background:   "#f1f5f9",
        padding:      "3px 10px",
        borderRadius: 99,
    },
    metaText: {
        fontSize: 12,
        color:    "#64748b",
    },
    dimText: {
        fontSize: 11,
        color:    "#94a3b8",
    },
    headerRight: {
        display:    "flex",
        alignItems: "center",
        gap:        10,
        flexShrink: 0,
    },
    chevron: {
        fontSize:   12,
        color:      "#94a3b8",
        fontWeight: 600,
    },
    matchedBanner: {
        display:    "flex",
        alignItems: "center",
        gap:        10,
        padding:    "12px 20px",
        background: "#eff6ff",
        borderTop:  "1px solid #bfdbfe",
        fontSize:   13,
        color:      "#1e40af",
    },
    successBanner: {
        display:    "flex",
        alignItems: "center",
        gap:        10,
        padding:    "12px 20px",
        background: "#f0fdf4",
        borderTop:  "1px solid #bbf7d0",
        fontSize:   13,
        color:      "#166534",
    },
    errBox: {
        margin:       "0 20px 12px",
        padding:      "10px 14px",
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 8,
        color:        "#dc2626",
        fontSize:     13,
    },
    link: {
        color:          "#c62828",
        textDecoration: "none",
        fontWeight:     600,
        fontSize:       13,
    },
    // ── Candidates panel ──────────────────────────────────────────────────────
    candidatesPanel: {
        padding:    "16px 20px",
        borderTop:  "1px solid #f1f5f9",
        background: "#fafbfc",
    },
    hintText: {
        fontSize: 13,
        color:    "#94a3b8",
        margin:   0,
    },
    noCandidates: {
        display:       "flex",
        flexDirection: "column" as const,
        alignItems:    "center",
        gap:           10,
        padding:       "24px 0",
        textAlign:     "center" as const,
    },
    candidatesHeader: {
        display:      "flex",
        alignItems:   "baseline",
        gap:          10,
        marginBottom: 14,
        flexWrap:     "wrap" as const,
    },
    candidatesTitle: {
        fontSize:   14,
        fontWeight: 700,
        color:      "#1e293b",
    },
    candidatesHint: {
        fontSize: 12,
        color:    "#94a3b8",
    },
    candidateGrid: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    // ── Candidate card ────────────────────────────────────────────────────────
    candidateCard: {
        display:      "flex",
        alignItems:   "center",
        gap:          14,
        padding:      "14px 16px",
        background:   "#fff",
        borderRadius: 12,
        border:       "1px solid #f1f5f9",
        boxShadow:    "0 2px 6px rgba(0,0,0,0.05)",
    },
    candidateAvatarWrap: {
        flexShrink: 0,
    },
    candidateAvatar: {
        width:          48,
        height:         48,
        borderRadius:   "50%",
        background:     "linear-gradient(135deg, #7f1d1d 0%, #c62828 100%)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        position:       "relative" as const,
        overflow:       "hidden",
        boxShadow:      "0 3px 10px rgba(198,40,40,0.35)",
    },
    candidateAvatarImg: {
        width:        48,
        height:       48,
        borderRadius: "50%",
        objectFit:    "cover" as const,
        boxShadow:    "0 3px 10px rgba(0,0,0,0.15)",
        display:      "block",
    },
    avatarDecor: {
        position:      "absolute" as const,
        top:           -10,
        right:         -10,
        width:         34,
        height:        34,
        borderRadius:  "50%",
        background:    "rgba(255,255,255,0.15)",
        pointerEvents: "none" as const,
    },
    avatarInitial: {
        position:   "relative" as const,
        zIndex:     1,
        color:      "#fff",
        fontWeight: 800,
        fontSize:   18,
    },
    candidateName: {
        fontWeight:   700,
        fontSize:     15,
        color:        "#0f172a",
        marginBottom: 2,
    },
    donorBadge: {
        fontSize:      10,
        fontWeight:    700,
        color:         "#991b1b",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        marginBottom:  6,
    },
    candidateTags: {
        display:      "flex",
        alignItems:   "center",
        gap:          6,
        marginBottom: 5,
        flexWrap:     "wrap" as const,
    },
    bloodChip: {
        fontSize:     12,
        fontWeight:   800,
        color:        "#991b1b",
        background:   "#fee2e2",
        border:       "1.5px solid #fecaca",
        padding:      "3px 10px",
        borderRadius: 8,
    },
    unitsBadge: {
        fontSize:     12,
        fontWeight:   600,
        color:        "#1e40af",
        background:   "#dbeafe",
        border:       "1px solid #bfdbfe",
        padding:      "3px 10px",
        borderRadius: 8,
    },
    ratingRow: {
        display:    "flex",
        alignItems: "center",
        gap:        5,
        marginBottom: 4,
    },
    ratingStars: {
        fontSize:   15,
        lineHeight: 1,
    },
    ratingText: {
        fontSize: 12,
        color:    "#64748b",
    },
    noReviews: {
        fontSize:   12,
        color:      "#94a3b8",
        fontStyle:  "italic",
        marginBottom: 4,
    },
    candidateDetail: {
        display:    "flex",
        alignItems: "flex-start",
        gap:        4,
        fontSize:   12,
        color:      "#64748b",
        lineHeight: "1.4",
    },
    matchedPill: {
        display:        "inline-flex",
        alignItems:     "center",
        gap:            6,
        background:     "#dcfce7",
        color:          "#166534",
        borderRadius:   8,
        fontSize:       12,
        fontWeight:     700,
        padding:        "8px 16px",
        flexShrink:     0,
        minWidth:       110,
        justifyContent: "center",
    },
    confirmBtn: {
        background:   "linear-gradient(135deg, #7f1d1d 0%, #c62828 100%)",
        color:        "#fff",
        border:       "none",
        borderRadius: 9,
        fontSize:     13,
        fontWeight:   700,
        padding:      "9px 18px",
        cursor:       "pointer",
        fontFamily:   "inherit",
        flexShrink:   0,
        whiteSpace:   "nowrap" as const,
        boxShadow:    "0 3px 10px rgba(198,40,40,0.3)",
        minWidth:     120,
    },
};
