import { useEffect, useState } from "react";
import AppLayout, { page } from "../components/AppLayout.tsx";
import {
        getBloodAvailabilityMetadata,
        predictAvailability,
        BLOOD_TYPE_LABEL_TO_ENUM,
        type BloodAvailabilityMetadata,
        type PredictionPayload,
        type PredictionResult,
} from "../api/bloodAvailability";

// ── Visual helpers ───────────────────────────────────────────────────────────

function availabilityStyle(availability: string) {
    const lower = availability.toLowerCase();
    if (lower.includes("very high"))
        return { bg: "#dcfce7", color: "#14532d", border: "#86efac", icon: "✅" };
    if (lower.includes("high") || lower.includes("adequate") || lower.includes("sufficient"))
        return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0", icon: "✅" };
    if (lower.includes("very low") || lower.includes("critical") || lower.includes("insufficient"))
        return { bg: "#fee2e2", color: "#991b1b", border: "#fecaca", icon: "🚨" };
    if (lower.includes("low"))
        return { bg: "#fef3c7", color: "#92400e", border: "#fde68a", icon: "⚠️" };
    if (lower.includes("medium") || lower.includes("moderate"))
        return { bg: "#fef9c3", color: "#854d0e", border: "#fef08a", icon: "🔔" };
    return { bg: "#f3f4f6", color: "#374151", border: "#e5e7eb", icon: "📊" };
}

function barColor(className: string): string {
    const lower = className.toLowerCase();
    if (lower.includes("high") || lower.includes("adequate") || lower.includes("sufficient"))
        return "#16a34a";
    if (lower.includes("very low") || lower.includes("critical") || lower.includes("insufficient"))
        return "#dc2626";
    if (lower.includes("low"))
        return "#d97706";
    if (lower.includes("medium") || lower.includes("moderate"))
        return "#f59e0b";
    return "#94a3b8";
}

// ── Types ────────────────────────────────────────────────────────────────────

type FormState = PredictionPayload;

const DEFAULT_FORM: FormState = {
    hospital:          "",
    hospitalSize:      "",
    month:             "",
    bloodType:         0,
    openingStock:      100,
    donationsReceived: 50,
    bloodRequests:     40,
    holidaySeason:     false,
    summerSeason:      false,
};

// ── Component ────────────────────────────────────────────────────────────────

export default function BloodAvailability() {
    const [metadata,    setMetadata]    = useState<BloodAvailabilityMetadata | null>(null);
    const [metaLoading, setMetaLoading] = useState(true);
    const [metaError,   setMetaError]   = useState<string | null>(null);

    const [form,       setForm]       = useState<FormState>(DEFAULT_FORM);
    const [predicting, setPredicting] = useState(false);
    const [result,     setResult]     = useState<PredictionResult | null>(null);
    const [predError,  setPredError]  = useState<string | null>(null);

    // GET /api/BloodAvailability/Metadata — populate all dropdowns from the model
    useEffect(() => {
        getBloodAvailabilityMetadata()
            .then(data => {
                setMetadata(data);
                const firstBt = data.bloodTypes[0] ?? "";
                setForm(prev => ({
                    ...prev,
                    hospital:     data.hospitals[0]     ?? "",
                    hospitalSize: data.hospitalSizes[0] ?? "",
                    month:        data.months[0]        ?? "",
                    // Store the integer enum value, not the display string
                    bloodType:    BLOOD_TYPE_LABEL_TO_ENUM[firstBt] ?? 0,
                }));
            })
            .catch(err => setMetaError(err instanceof Error ? err.message : "Failed to load prediction model."))
            .finally(() => setMetaLoading(false));
    }, []);

    function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm(prev => ({ ...prev, [key]: value }));
        // Clear previous result when the user modifies the form
        setResult(null);
        setPredError(null);
    }

    async function handlePredict() {
        if (!form.hospital || !form.hospitalSize || !form.month || !form.bloodType) {
            setPredError("Please fill in all dropdown fields before predicting.");
            return;
        }
        setPredError(null);
        setPredicting(true);
        try {
            // POST /api/BloodAvailability/Predict
            const res = await predictAvailability(form);
            setResult(res);
        } catch (err) {
            setPredError(err instanceof Error ? err.message : "Prediction failed. Please try again.");
        } finally {
            setPredicting(false);
        }
    }

    // Sort probabilities highest → lowest for the bar chart
    const sortedProbs = result
        ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])
        : [];

    const avStyle = result ? availabilityStyle(result.availability) : null;

    return (
        <AppLayout>

            {/* Keyframe for the loading spinner — inline <style> is valid in React */}
            <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── Page header ── */}
            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>Blood Availability Predictor</h2>
                    <p style={page.subtitle}>
                        AI-powered forecast of blood availability at hospitals
                    </p>
                </div>

                {/* Model accuracy badge — from GET /api/BloodAvailability/Metadata */}
                {metadata && (
                    <div style={st.accuracyCard}>
                        <span style={st.accuracyTop}>Model Accuracy</span>
                        <span style={st.accuracyValue}>
                            {(metadata.testAccuracy * 100).toFixed(1)}%
                        </span>
                    </div>
                )}
            </header>

            {/* ── Loading ── */}
            {metaLoading && (
                <div style={st.centerBox}>
                    <div style={st.spinner} />
                    <span style={{ color: "#64748b", fontSize: 14 }}>
                        Loading prediction model…
                    </span>
                </div>
            )}

            {/* ── Metadata error ── */}
            {metaError && (
                <div style={st.errBanner}>
                    <span>⚠️</span>
                    <span>{metaError}</span>
                </div>
            )}

            {/* ── Prediction form ── */}
            {!metaLoading && !metaError && metadata && (
                <div style={{ ...page.card, marginBottom: 24 }}>

                    <h3 style={st.formHeading}>Make a Prediction</h3>
                    <p style={st.formDesc}>
                        Fill in hospital details and stock figures to forecast blood availability.
                    </p>

                    {/* Section 1 — Hospital Information */}
                    <div style={st.section}>
                        <div style={st.sectionTag}>Hospital Information</div>
                        <div style={st.grid3}>
                            <div style={page.formRow}>
                                <label style={page.label}>Hospital</label>
                                <select
                                    style={page.input}
                                    value={form.hospital}
                                    onChange={e => setField("hospital", e.target.value)}
                                >
                                    {/* TODO: BACKEND – options come from metadata.hospitals */}
                                    {metadata.hospitals.map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={page.formRow}>
                                <label style={page.label}>Hospital Size</label>
                                <select
                                    style={page.input}
                                    value={form.hospitalSize}
                                    onChange={e => setField("hospitalSize", e.target.value)}
                                >
                                    {/* TODO: BACKEND – options from metadata.hospitalSizes */}
                                    {metadata.hospitalSizes.map(hs => (
                                        <option key={hs} value={hs}>{hs}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={page.formRow}>
                                <label style={page.label}>Month</label>
                                <select
                                    style={page.input}
                                    value={form.month}
                                    onChange={e => setField("month", e.target.value)}
                                >
                                    {/* TODO: BACKEND – options from metadata.months */}
                                    {metadata.months.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section 2 — Blood Type */}
                    <div style={st.section}>
                        <div style={st.sectionTag}>Blood Information</div>
                        <div style={{ maxWidth: 260 }}>
                            <div style={page.formRow}>
                                <label style={page.label}>Blood Type</label>
                                <select
                                    style={page.input}
                                    value={form.bloodType}
                                    onChange={e => setField("bloodType", Number(e.target.value))}
                                >
                                    {/*
                                      Each option value is the BloodTypeName integer the backend expects.
                                      BLOOD_TYPE_LABEL_TO_ENUM maps "A+", "APositive", etc. → 0, 1, …
                                      If the metadata returns a format not yet in the map it falls back
                                      to the array index so the dropdown still works.
                                    */}
                                    {metadata.bloodTypes.map((bt, idx) => (
                                        <option
                                            key={bt}
                                            value={BLOOD_TYPE_LABEL_TO_ENUM[bt] ?? idx}
                                        >
                                            {bt}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section 3 — Stock Data */}
                    <div style={st.section}>
                        <div style={st.sectionTag}>Current Stock Data</div>
                        <div style={st.grid3}>
                            <div style={page.formRow}>
                                <label style={page.label}>Opening Stock (units)</label>
                                <input
                                    style={page.input}
                                    type="number"
                                    min={0}
                                    value={form.openingStock}
                                    onChange={e =>
                                        setField("openingStock", Math.max(0, Number(e.target.value)))
                                    }
                                />
                            </div>

                            <div style={page.formRow}>
                                <label style={page.label}>Donations Received</label>
                                <input
                                    style={page.input}
                                    type="number"
                                    min={0}
                                    value={form.donationsReceived}
                                    onChange={e =>
                                        setField("donationsReceived", Math.max(0, Number(e.target.value)))
                                    }
                                />
                            </div>

                            <div style={page.formRow}>
                                <label style={page.label}>Blood Requests</label>
                                <input
                                    style={page.input}
                                    type="number"
                                    min={0}
                                    value={form.bloodRequests}
                                    onChange={e =>
                                        setField("bloodRequests", Math.max(0, Number(e.target.value)))
                                    }
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 4 — Seasonal Factors */}
                    <div style={st.section}>
                        <div style={st.sectionTag}>Seasonal Factors</div>
                        <div style={st.toggleRow}>
                            <ToggleChip
                                label="🎉 Holiday Season"
                                value={form.holidaySeason}
                                onChange={v => setField("holidaySeason", v)}
                            />
                            <ToggleChip
                                label="☀️ Summer Season"
                                value={form.summerSeason}
                                onChange={v => setField("summerSeason", v)}
                            />
                        </div>
                        <p style={st.hint}>
                            Enable if the predicted period falls within a holiday or summer season —
                            these affect blood demand and donation patterns.
                        </p>
                    </div>

                    {predError && (
                        <div style={st.errBanner}>
                            <span>⚠️</span>
                            <span>{predError}</span>
                        </div>
                    )}

                    <button
                        style={{ ...page.primaryBtn, opacity: predicting ? 0.7 : 1 }}
                        onClick={handlePredict}
                        disabled={predicting}
                    >
                        {predicting ? "Predicting…" : "Predict Blood Availability"}
                    </button>
                </div>
            )}

            {/* ── Prediction result ── */}
            {result && avStyle && (
                <div style={{ ...page.card, border: `1px solid ${avStyle.border}` }}>

                    {/* Result header */}
                    <div style={st.resultRow}>
                        <div style={{ fontSize: 40, lineHeight: "1" }}>{avStyle.icon}</div>

                        <div>
                            <div style={st.resultEyebrow}>Prediction Result</div>
                            <div
                                style={{
                                    ...st.resultLabel,
                                    color:      avStyle.color,
                                    background: avStyle.bg,
                                    border:     `1px solid ${avStyle.border}`,
                                }}
                            >
                                {result.availability}
                            </div>
                        </div>

                        <div style={{ flex: 1 }} />

                        {/* Contextual metadata from the submitted form */}
                        <div style={st.contextGrid}>
                            <span style={st.ctxKey}>Hospital</span>
                            <span style={st.ctxVal}>{form.hospital}</span>
                            <span style={st.ctxKey}>Blood Type</span>
                            <span style={st.ctxVal}>{form.bloodType}</span>
                            <span style={st.ctxKey}>Month</span>
                            <span style={st.ctxVal}>{form.month}</span>
                        </div>
                    </div>

                    <div style={st.divider} />

                    {/* Probability breakdown */}
                    <h4 style={st.probHeading}>Probability Breakdown</h4>
                    <div style={st.bars}>
                        {sortedProbs.map(([cls, prob]) => {
                            const pct = prob * 100;
                            const isWinner = cls === result.availability;
                            return (
                                <div key={cls} style={st.barRow}>
                                    <div style={{
                                        ...st.barName,
                                        fontWeight: isWinner ? 700 : 400,
                                        color:      isWinner ? "#1e293b" : "#64748b",
                                    }}>
                                        {cls}
                                        {isWinner && <span style={st.winnerBadge}>predicted</span>}
                                    </div>
                                    <div style={st.track}>
                                        <div
                                            style={{
                                                ...st.fill,
                                                width:      `${pct}%`,
                                                background: barColor(cls),
                                                opacity:    isWinner ? 1 : 0.45,
                                            }}
                                        />
                                    </div>
                                    <div style={st.pct}>{pct.toFixed(1)}%</div>
                                </div>
                            );
                        })}
                    </div>

                    <p style={st.disclaimer}>
                        Predictions are based on historical patterns and may not reflect real-time
                        conditions. Always verify with hospital staff before making decisions.
                    </p>
                </div>
            )}

        </AppLayout>
    );
}

// ── Toggle chip ──────────────────────────────────────────────────────────────

function ToggleChip({
    label,
    value,
    onChange,
}: {
    label:    string;
    value:    boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            style={{
                padding:      "9px 18px",
                borderRadius: 99,
                border:       `2px solid ${value ? "#c62828" : "#e2e8f0"}`,
                background:   value ? "#c62828" : "#fff",
                color:        value ? "#fff" : "#374151",
                fontSize:     13,
                fontWeight:   600,
                cursor:       "pointer",
                fontFamily:   "inherit",
            }}
            onClick={() => onChange(!value)}
        >
            {label}
        </button>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = {
    accuracyCard: {
        display:       "flex",
        flexDirection: "column" as const,
        alignItems:    "center",
        background:    "#fff",
        border:        "1px solid #e2e8f0",
        borderRadius:  12,
        padding:       "12px 24px",
        boxShadow:     "0 1px 4px rgba(0,0,0,0.06)",
        gap:           2,
    },
    accuracyTop: {
        fontSize:      11,
        fontWeight:    600,
        color:         "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
    },
    accuracyValue: {
        fontSize:   26,
        fontWeight: 700,
        color:      "#16a34a",
        lineHeight: "1.1",
    },
    centerBox: {
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            12,
        padding:        "60px 0",
    },
    spinner: {
        width:        24,
        height:       24,
        borderRadius: "50%",
        border:       "3px solid #e2e8f0",
        borderTopColor: "#c62828",
        animation:    "_spin 0.8s linear infinite",
    },
    errBanner: {
        display:      "flex",
        alignItems:   "flex-start",
        gap:          10,
        padding:      "12px 16px",
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 8,
        color:        "#dc2626",
        fontSize:     13,
        fontWeight:   500,
        marginBottom: 16,
    },
    formHeading: {
        margin:     "0 0 4px",
        fontSize:   16,
        fontWeight: 700,
        color:      "#1e293b",
    },
    formDesc: {
        margin:       "0 0 22px",
        fontSize:     13,
        color:        "#64748b",
    },
    section: {
        marginBottom: 22,
    },
    sectionTag: {
        fontSize:      11,
        fontWeight:    700,
        color:         "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.6px",
        marginBottom:  10,
    },
    grid3: {
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:                 14,
    },
    toggleRow: {
        display:  "flex",
        gap:      10,
        flexWrap: "wrap" as const,
    },
    hint: {
        margin:   "10px 0 0",
        fontSize: 12,
        color:    "#94a3b8",
    },
    resultRow: {
        display:      "flex",
        alignItems:   "flex-start",
        gap:          16,
        marginBottom: 20,
        flexWrap:     "wrap" as const,
    },
    resultEyebrow: {
        fontSize:      11,
        fontWeight:    600,
        color:         "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        marginBottom:  6,
    },
    resultLabel: {
        fontSize:     22,
        fontWeight:   700,
        padding:      "5px 18px",
        borderRadius: 8,
        display:      "inline-block",
    },
    contextGrid: {
        display:             "grid",
        gridTemplateColumns: "auto auto",
        columnGap:           10,
        rowGap:              2,
        alignItems:          "baseline",
    },
    ctxKey: {
        fontSize:      10,
        fontWeight:    600,
        color:         "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        textAlign:     "right" as const,
    },
    ctxVal: {
        fontSize:   13,
        fontWeight: 600,
        color:      "#1e293b",
    },
    divider: {
        height:       1,
        background:   "#f1f5f9",
        margin:       "0 0 16px",
    },
    probHeading: {
        margin:     "0 0 12px",
        fontSize:   14,
        fontWeight: 600,
        color:      "#374151",
    },
    bars: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
        marginBottom:  16,
    },
    barRow: {
        display:    "flex",
        alignItems: "center",
        gap:        10,
    },
    barName: {
        fontSize:   13,
        width:      130,
        flexShrink: 0,
        display:    "flex",
        alignItems: "center",
        gap:        6,
    },
    winnerBadge: {
        fontSize:      9,
        fontWeight:    700,
        color:         "#c62828",
        background:    "#fee2e2",
        padding:       "2px 6px",
        borderRadius:  99,
        textTransform: "uppercase" as const,
        letterSpacing: "0.3px",
    },
    track: {
        flex:         1,
        height:       10,
        borderRadius: 99,
        background:   "#f1f5f9",
        overflow:     "hidden",
    },
    fill: {
        height:       "100%",
        borderRadius: 99,
        transition:   "width 0.5s ease",
    },
    pct: {
        fontSize:   12,
        fontWeight: 600,
        color:      "#64748b",
        width:      50,
        textAlign:  "right" as const,
        flexShrink: 0,
    },
    disclaimer: {
        fontSize:   11,
        color:      "#94a3b8",
        borderTop:  "1px solid #f1f5f9",
        paddingTop: 12,
        margin:     "0",
        fontStyle:  "italic",
    },
};
