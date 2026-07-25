import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeUserOnboarding } from "../api/profile";
import { logout } from "../auth/Keycloak.ts";
import { useUser } from "../context/UserContext.tsx";
import { BusinessRole } from "../types";

// BusinessRole options shown to the user during onboarding.
// TODO: BACKEND – Update values/labels if new roles are added.
const ROLE_OPTIONS = [
    { value: BusinessRole.Donor,          label: "Blood Donor"        },
    { value: BusinessRole.Seeker,         label: "Blood Seeker"       },
    { value: BusinessRole.DonorAndSeeker, label: "Both (Donor & Seeker)" },
];

export default function Onboarding() {
    const navigate    = useNavigate();
    const { setProfile } = useUser();

    const [name,         setName]         = useState("");
    const [businessRole, setBusinessRole] = useState<BusinessRole>(BusinessRole.Seeker);
    const [latitude,     setLatitude]     = useState<number | undefined>();
    const [longitude,    setLongitude]    = useState<number | undefined>();
    const [isAvailable,  setIsAvailable]  = useState(true);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState<string | null>(null);

    async function handleSubmit() {
        if (!name.trim()) {
            setError("Please enter your name.");
            return;
        }
        setError(null);
        setLoading(true);

        try {
            // POST /api/CompleteOnboarding
            // The response is stored in UserContext (sessionStorage) so the
            // dashboard and other pages can read the user's name and role.
            const profile = await completeUserOnboarding({
                name:         name.trim(),
                businessRole,
                latitude,
                longitude,
                isAvailable,
            });

            setProfile(profile);
            sessionStorage.setItem("profileCompleted", "true");
            navigate("/dashboard");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Something went wrong.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={s.page}>
            <div style={s.card}>

                <div style={s.iconCircle}>🩸</div>

                <h1 style={s.title}>Complete Your Profile</h1>
                <p style={s.subtitle}>
                    Tell us how you want to contribute to the blood donation community.
                </p>

                {error && <div style={s.errorBox}>{error}</div>}

                {/* Name */}
                <div style={s.field}>
                    <label style={s.label}>Full Name</label>
                    <input
                        style={s.input}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Your full name"
                        disabled={loading}
                    />
                </div>

                {/* Role */}
                <div style={s.field}>
                    <label style={s.label}>Your Role</label>
                    <select
                        style={s.input}
                        value={businessRole}
                        onChange={e => setBusinessRole(Number(e.target.value) as BusinessRole)}
                        disabled={loading}
                    >
                        {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Location — optional */}
                <div style={s.field}>
                    <label style={s.label}>Location (optional)</label>
                    <div style={s.row}>
                        <input
                            style={s.input}
                            type="number"
                            placeholder="Latitude"
                            value={latitude ?? ""}
                            onChange={e => setLatitude(e.target.value ? Number(e.target.value) : undefined)}
                            disabled={loading}
                        />
                        <input
                            style={s.input}
                            type="number"
                            placeholder="Longitude"
                            value={longitude ?? ""}
                            onChange={e => setLongitude(e.target.value ? Number(e.target.value) : undefined)}
                            disabled={loading}
                        />
                    </div>
                </div>

                {/* Availability — only relevant for donors */}
                {(businessRole === BusinessRole.Donor || businessRole === BusinessRole.DonorAndSeeker) && (
                    <div style={s.toggleRow}>
                        <div>
                            <div style={s.toggleLabel}>Available to donate now</div>
                            <div style={s.toggleHint}>You can change this later from your dashboard.</div>
                        </div>
                        <button
                            style={{
                                ...s.toggle,
                                background: isAvailable ? "#c62828" : "#e2e8f0",
                            }}
                            onClick={() => setIsAvailable(v => !v)}
                            disabled={loading}
                        >
                            <span style={{
                                ...s.toggleThumb,
                                transform: isAvailable ? "translateX(20px)" : "translateX(2px)",
                            }} />
                        </button>
                    </div>
                )}

                <button
                    style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? "Setting up your profile…" : "Complete Profile"}
                </button>

                <button style={s.logoutLink} onClick={logout}>
                    Sign out
                </button>

            </div>
        </div>
    );
}

const s = {
    page: {
        minHeight:      "100vh",
        display:        "flex",
        justifyContent: "center",
        alignItems:     "center",
        background:     "linear-gradient(135deg, #fff 0%, #ffe8e8 100%)",
        padding:        "24px 16px",
        boxSizing:      "border-box" as const,
    },
    card: {
        width:         "100%",
        maxWidth:      440,
        padding:       "40px 36px",
        borderRadius:  20,
        background:    "#fff",
        boxShadow:     "0 20px 48px rgba(0,0,0,0.12)",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           16,
    },
    iconCircle: {
        margin:         "0 auto",
        width:          64,
        height:         64,
        borderRadius:   "50%",
        background:     "#c62828",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       30,
    },
    title: {
        color:      "#c62828",
        fontSize:   22,
        fontWeight: 700,
        textAlign:  "center" as const,
        margin:     0,
    },
    subtitle: {
        color:      "#64748b",
        textAlign:  "center" as const,
        fontSize:   14,
        margin:     0,
    },
    errorBox: {
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 8,
        padding:      "10px 14px",
        color:        "#dc2626",
        fontSize:     13,
    },
    field: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           6,
    },
    label: {
        fontSize:   13,
        fontWeight: 600,
        color:      "#374151",
    },
    input: {
        padding:      "11px 12px",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     14,
        fontFamily:   "inherit",
        color:        "#1e293b",
        outline:      "none",
        flex:         1,
    },
    row: {
        display: "flex",
        gap:     10,
    },
    toggleRow: {
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "12px 14px",
        background:     "#f8fafc",
        borderRadius:   10,
        border:         "1px solid #e2e8f0",
    },
    toggleLabel: {
        fontSize:   14,
        fontWeight: 600,
        color:      "#1e293b",
    },
    toggleHint: {
        fontSize: 12,
        color:    "#94a3b8",
        marginTop: 2,
    },
    toggle: {
        width:        44,
        height:       26,
        borderRadius: 13,
        border:       "none",
        cursor:       "pointer",
        position:     "relative" as const,
        flexShrink:   0,
        transition:   "background 0.2s",
        padding:      0,
    },
    toggleThumb: {
        position:     "absolute" as const,
        top:          3,
        width:        20,
        height:       20,
        borderRadius: "50%",
        background:   "#fff",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.2)",
        transition:   "transform 0.2s",
    },
    submitBtn: {
        padding:      "13px",
        borderRadius: 10,
        border:       "none",
        background:   "#c62828",
        color:        "#fff",
        fontSize:     15,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
        marginTop:    4,
    },
    logoutLink: {
        background:  "none",
        border:      "none",
        color:       "#94a3b8",
        fontSize:    13,
        cursor:      "pointer",
        textAlign:   "center" as const,
        fontFamily:  "inherit",
    },
};
