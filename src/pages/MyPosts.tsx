import { useEffect, useState } from "react";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { createDonationPost, getMyDonationPosts } from "../api/donationPosts";
import { BLOOD_TYPE_OPTIONS, bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import type { DonationPostCandidateViewModel } from "../types";

export default function MyPosts() {
    const [posts,       setPosts]       = useState<DonationPostCandidateViewModel[]>([]);
    const [postsLoading,setPostsLoading]= useState(true);
    const [postsError,  setPostsError]  = useState<string | null>(null);
    const [showForm,    setShowForm]    = useState(false);
    const [bloodType,   setBloodType]   = useState(0);
    const [quantity,    setQuantity]    = useState(1);
    const [submitting,  setSubmitting]  = useState(false);
    const [formError,   setFormError]   = useState<string | null>(null);
    const [successMsg,  setSuccessMsg]  = useState<string | null>(null);

    function loadPosts() {
        setPostsLoading(true);
        setPostsError(null);
        // GET /api/donationpost/get-current-user-donation-posts
        getMyDonationPosts()
            .then(setPosts)
            .catch(err => setPostsError(err instanceof Error ? err.message : "Failed to load posts."))
            .finally(() => setPostsLoading(false));
    }

    useEffect(loadPosts, []);

    async function handleCreate() {
        if (quantity < 1) { setFormError("Quantity must be at least 1."); return; }
        setFormError(null);
        setSuccessMsg(null);
        setSubmitting(true);

        try {
            // POST /api/donationpost/create-donation-post
            await createDonationPost({ bloodTypeName: bloodType, quantity });
            setSuccessMsg("Your donation post was created successfully!");
            setShowForm(false);
            loadPosts(); // refresh the list
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to create post.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AppLayout>

            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>My Donation Posts</h2>
                    <p style={page.subtitle}>Signal your availability to donate blood</p>
                </div>
                {!showForm && (
                    <button style={page.primaryBtn} onClick={() => { setShowForm(true); setSuccessMsg(null); }}>
                        + New Post
                    </button>
                )}
            </header>

            {successMsg && (
                <div style={s.successBox}>{successMsg}</div>
            )}

            {/* ── Create form ── */}
            {showForm && (
                <div style={{ ...page.card, marginBottom: 24 }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                        New Donation Post
                    </h3>
                    <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
                        Post your blood availability so seekers can find you when they need your blood type.
                    </p>

                    {formError && <div style={s.errBox}>{formError}</div>}

                    <div style={s.formGrid}>
                        {/* Blood type */}
                        <div style={page.formRow}>
                            <label style={page.label}>Your Blood Type</label>
                            <select
                                style={page.input}
                                value={bloodType}
                                onChange={e => setBloodType(Number(e.target.value))}
                            >
                                {BLOOD_TYPE_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Quantity */}
                        <div style={page.formRow}>
                            <label style={page.label}>Quantity (units available)</label>
                            <input
                                style={page.input}
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={e => setQuantity(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button
                            style={{ ...page.primaryBtn, opacity: submitting ? 0.7 : 1 }}
                            onClick={handleCreate}
                            disabled={submitting}
                        >
                            {submitting ? "Posting…" : "Post Availability"}
                        </button>
                        <button style={page.secondaryBtn} onClick={() => setShowForm(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Post list ── */}
            {!showForm && (
                <>
                    {postsLoading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
                    {postsError   && <p style={{ color: "#dc2626", fontSize: 13 }}>{postsError}</p>}

                    {!postsLoading && !postsError && posts.length === 0 && (
                        <div style={page.emptyBox}>
                            <span style={{ fontSize: 36, opacity: 0.3 }}>📌</span>
                            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>No donation posts yet.</p>
                            <button style={page.primaryBtn} onClick={() => setShowForm(true)}>
                                Create Your First Post
                            </button>
                        </div>
                    )}

                    {!postsLoading && posts.length > 0 && (
                        <div style={s.list}>
                            {posts.map((p, i) => (
                                <div key={p.donationPostId || i} style={page.card}>
                                    <div style={s.postRow}>
                                        {/* bloodTypeName is a string from backend e.g. "APositive" */}
                                        <div style={page.bloodCircle}>
                                            {bloodTypeNameStringToLabel(p.bloodTypeName ?? "")}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={s.postTitle}>
                                                {bloodTypeNameStringToLabel(p.bloodTypeName ?? "")} blood
                                            </div>
                                            <div style={{ fontSize: 13, color: "#64748b" }}>
                                                {p.quantity ?? "?"} unit(s) available
                                                {/* TODO: BACKEND – add status/location once the my-posts response includes them */}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

        </AppLayout>
    );
}

const s = {
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    postRow: {
        display:    "flex",
        alignItems: "center",
        gap:        14,
    },
    postTitle: {
        fontWeight:   600,
        fontSize:     14,
        color:        "#1e293b",
        marginBottom: 2,
    },
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
    successBox: {
        background:   "#dcfce7",
        border:       "1px solid #bbf7d0",
        borderRadius: 8,
        padding:      "12px 16px",
        color:        "#166534",
        fontSize:     14,
        fontWeight:   500,
        marginBottom: 20,
    },
};
