import { useEffect, useState } from "react";
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
    const [formLat,          setFormLat]          = useState("");
    const [formLng,          setFormLng]          = useState("");
    const [formError,        setFormError]        = useState<string | null>(null);

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
            latitude:      formLat ? Number(formLat) : undefined,
            longitude:     formLng ? Number(formLng) : undefined,
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

                        {/* Location — optional */}
                        <div style={page.formRow}>
                            <label style={page.label}>Latitude (optional)</label>
                            <input
                                style={page.input}
                                type="number"
                                placeholder="33.8938"
                                value={formLat}
                                onChange={e => setFormLat(e.target.value)}
                            />
                        </div>
                        <div style={page.formRow}>
                            <label style={page.label}>Longitude (optional)</label>
                            <input
                                style={page.input}
                                type="number"
                                placeholder="35.5018"
                                value={formLng}
                                onChange={e => setFormLng(e.target.value)}
                            />
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
};
