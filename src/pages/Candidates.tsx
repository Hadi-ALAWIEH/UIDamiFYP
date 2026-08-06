import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { getMyDonationRequests, confirmMatch } from "../api/donationRequests";
import { getCandidatesForRequest } from "../api/donationRequests";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import {
    DonationRequestStatus,
    DonationRequestUrgency,
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

            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>Find Donors</h2>
                    <p style={page.subtitle}>
                        View matching donors for each of your donation requests
                    </p>
                </div>
                {!loading && (
                    <div style={st.badge}>
                        <span style={{ fontWeight: 700, fontSize: 18, color: "#c62828" }}>
                            {pendingCount}
                        </span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>
                            pending {pendingCount === 1 ? "request" : "requests"}
                        </span>
                    </div>
                )}
            </header>

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
                            }}
                        >

                            {/* ── Request header (always visible) ── */}
                            <button
                                style={{
                                    ...st.requestHeader,
                                    cursor: isPending ? "pointer" : "default",
                                    borderBottom: slot.expanded ? "1px solid #f1f5f9" : "none",
                                }}
                                onClick={() => isPending && toggleRequest(req)}
                            >
                                {/* Blood type circle */}
                                <div style={page.bloodCircle}>
                                    {bloodTypeNameStringToLabel(req.bloodTypeName ?? "")}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={st.requestTitle}>
                                        {req.address ?? "No address provided"}
                                    </div>
                                    <div style={st.requestMeta}>
                                        <span style={page.statusChip(um.bg, um.color)}>
                                            {um.label} urgency
                                        </span>
                                        <span style={st.metaText}>
                                            {req.quantity ?? "?"} unit{(req.quantity ?? 1) !== 1 ? "s" : ""}
                                        </span>
                                        {req.neededByDate && (
                                            <span style={st.metaText}>
                                                · Needed by {fmtDate(req.neededByDate)}
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
    return (
        <div style={st.candidateCard}>
            {/* Avatar */}
            <div style={st.candidateAvatar}>
                {candidate.donorName?.charAt(0)?.toUpperCase() ?? "?"}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={st.candidateName}>{candidate.donorName}</div>
                <div style={st.candidateDetail}>
                    {candidate.donorAddress ?? "No address provided"}
                </div>
                <div style={st.candidateTags}>
                    <span style={page.bloodCircle}>
                        {bloodTypeNameStringToLabel(candidate.bloodTypeName ?? "")}
                    </span>
                    <span style={st.unitsBadge}>
                        {candidate.quantity ?? "?"} unit{(candidate.quantity ?? 1) !== 1 ? "s" : ""} available
                    </span>
                </div>
            </div>

            {/* Action — once this donor is already matched to the request, replace
                the button entirely with a non-interactive "Matched" pill so it
                can't be confirmed again (whether that happened just now in this
                session, or on an earlier visit — either way the server already
                told us via candidate.isMatched). */}
            {alreadyMatched ? (
                <span style={{
                    ...page.statusChip("#dcfce7", "#166534"),
                    minWidth:   120,
                    textAlign:  "center" as const,
                    fontSize:   13,
                    padding:    "9px 16px",
                }}>
                    ✓ Matched
                </span>
            ) : (
                <button
                    style={{
                        ...page.primaryBtn,
                        opacity:    anyConfirming ? 0.6 : 1,
                        whiteSpace: "nowrap",
                        minWidth:   120,
                    }}
                    onClick={onConfirm}
                    disabled={anyConfirming}
                >
                    {confirming ? "Confirming…" : "Confirm Match"}
                </button>
            )}
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = {
    badge: {
        display:       "flex",
        flexDirection: "column" as const,
        alignItems:    "center",
        background:    "#fff",
        border:        "1px solid #e2e8f0",
        borderRadius:  12,
        padding:       "10px 20px",
        boxShadow:     "0 1px 4px rgba(0,0,0,0.05)",
        gap:           2,
    },
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           12,
    },
    requestCard: {
        background:   "#fff",
        borderRadius: 12,
        boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
        overflow:     "hidden",
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
    requestTitle: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 5,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    },
    requestMeta: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
        flexWrap:   "wrap" as const,
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
        fontSize: 11,
        color:    "#94a3b8",
    },
    matchedBanner: {
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "12px 20px",
        background:   "#eff6ff",
        borderTop:    "1px solid #bfdbfe",
        fontSize:     13,
        color:        "#1e40af",
    },
    successBanner: {
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "12px 20px",
        background:   "#f0fdf4",
        borderTop:    "1px solid #bbf7d0",
        fontSize:     13,
        color:        "#166534",
    },
    errBox: {
        margin:     "0 20px 12px",
        padding:    "10px 14px",
        background: "#fef2f2",
        border:     "1px solid #fecaca",
        borderRadius: 8,
        color:      "#dc2626",
        fontSize:   13,
    },
    link: {
        color:          "#c62828",
        textDecoration: "none",
        fontWeight:     600,
        fontSize:       13,
    },
    candidatesPanel: {
        padding: "16px 20px",
        borderTop: "1px solid #f8fafc",
        background: "#fafafa",
    },
    hintText: {
        fontSize: 13,
        color:    "#94a3b8",
        margin:   0,
    },
    noCandidates: {
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        gap:            10,
        padding:        "24px 0",
        textAlign:      "center" as const,
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
    candidateCard: {
        display:      "flex",
        alignItems:   "center",
        gap:          14,
        padding:      "14px 16px",
        background:   "#fff",
        borderRadius: 10,
        border:       "1px solid #e2e8f0",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.04)",
    },
    candidateAvatar: {
        width:          44,
        height:         44,
        borderRadius:   "50%",
        background:     "#f1f5f9",
        color:          "#475569",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       17,
        flexShrink:     0,
        border:         "2px solid #e2e8f0",
    },
    candidateName: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 2,
    },
    candidateDetail: {
        fontSize:     12,
        color:        "#64748b",
        marginBottom: 6,
    },
    candidateTags: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
    },
    unitsBadge: {
        fontSize:     12,
        fontWeight:   600,
        color:        "#64748b",
        background:   "#f1f5f9",
        padding:      "3px 10px",
        borderRadius: 99,
    },
};
