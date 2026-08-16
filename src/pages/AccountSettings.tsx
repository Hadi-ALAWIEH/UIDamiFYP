import React, { useRef, useState, useEffect } from "react";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { useUser } from "../context/UserContext.tsx";
import { updateUserProfile } from "../api/profile.ts";
import { BusinessRole, BadgeTier, BADGE_META } from "../types";

const ROLE_OPTIONS = [
    { value: BusinessRole.Donor,         label: "Donor",           desc: "I want to donate blood" },
    { value: BusinessRole.Seeker,        label: "Seeker",          desc: "I need blood donations" },
    { value: BusinessRole.DonorAndSeeker,label: "Donor & Seeker",  desc: "Both roles" },
];

const apiBase = import.meta.env.VITE_API_URL ?? "https://localhost:7212";

export default function AccountSettings() {
    const { profile, refreshProfile } = useUser();

    const [name, setName]               = useState(profile?.name ?? "");
    const [role, setRole]               = useState<BusinessRole>(profile?.businessRole ?? BusinessRole.Seeker);
    const [isAvailable, setIsAvailable] = useState(profile?.isAvailable ?? false);
    const [file, setFile]               = useState<File | null>(null);
    const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
    const [saving, setSaving]           = useState(false);
    const [saved, setSaved]             = useState(false);
    const [error, setError]             = useState<string | null>(null);
    const fileRef                       = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setName(profile?.name ?? "");
        setRole(profile?.businessRole ?? BusinessRole.Seeker);
        setIsAvailable(profile?.isAvailable ?? false);
    }, [profile]);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selected = e.target.files?.[0];
        if (!selected) return;
        setFile(selected);
        setPreviewUrl(URL.createObjectURL(selected));
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) { setError("Name cannot be empty."); return; }
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
            const fd = new FormData();
            fd.append("Name", name.trim());
            fd.append("BusinessRole", String(role));
            fd.append("IsAvailable", String(isAvailable));
            if (profile?.latitude != null)  fd.append("Latitude",  String(profile.latitude));
            if (profile?.longitude != null) fd.append("Longitude", String(profile.longitude));
            if (file) fd.append("ProfilePicture", file);
            await updateUserProfile(fd);
            await refreshProfile();
            setSaved(true);
            setFile(null);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save changes.");
        } finally {
            setSaving(false);
        }
    }

    const currentAvatarUrl = previewUrl
        ?? (profile?.profilePictureUrl ? `${apiBase}${profile.profilePictureUrl}` : null);

    return (
        <AppLayout>
            <div>
                <div style={page.topBar}>
                    <div>
                        <h1 style={page.title}>Account Settings</h1>
                        <p style={page.subtitle}>Update your profile information and preferences</p>
                    </div>
                </div>

                <form onSubmit={handleSave} style={s.form}>

                    {/* ── Avatar section ── */}
                    <div style={s.card}>
                        <h2 style={s.sectionTitle}>Profile Picture</h2>
                        <div style={s.avatarSection}>
                            <div style={s.avatarWrap} onClick={() => fileRef.current?.click()}>
                                {currentAvatarUrl ? (
                                    <img src={currentAvatarUrl} alt="Profile" style={s.avatarImg} />
                                ) : (
                                    <div style={s.avatarPlaceholder}>
                                        {(profile?.name ?? "U").charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div style={s.avatarOverlay}>
                                    <span style={s.cameraIcon}>📷</span>
                                </div>
                            </div>
                            <div style={s.avatarMeta}>
                                {(() => {
                                    const tier = profile?.badgeTier ?? BadgeTier.Newcomer;
                                    const m = BADGE_META[tier];
                                    return (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                            <span style={{ background: m.bg, color: m.color, borderRadius: 99, padding: "4px 14px", fontSize: 13, fontWeight: 800 }}>
                                                {m.emoji} {m.label}
                                            </span>
                                            <span style={{ fontSize: 12, color: "#64748b" }}>
                                                {profile?.donationPoints ?? 0} point{(profile?.donationPoints ?? 0) !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    );
                                })()}
                                <p style={s.avatarHint}>Click the image to upload a new photo.</p>
                                <p style={s.avatarHintSub}>JPG, PNG or WEBP. Max 5 MB recommended.</p>
                                {file && (
                                    <p style={s.fileChosen}>
                                        Selected: <strong>{file.name}</strong>
                                    </p>
                                )}
                                <button type="button" style={s.chooseBtn} onClick={() => fileRef.current?.click()}>
                                    Choose Photo
                                </button>
                            </div>
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* ── Name ── */}
                    <div style={s.card}>
                        <h2 style={s.sectionTitle}>Display Name</h2>
                        <div style={page.formRow}>
                            <label style={page.label} htmlFor="name">Full Name</label>
                            <input
                                id="name"
                                style={page.input}
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Your full name"
                                maxLength={100}
                            />
                        </div>
                    </div>

                    {/* ── Role ── */}
                    <div style={s.card}>
                        <h2 style={s.sectionTitle}>Role</h2>
                        <p style={s.roleHint}>
                            Your role determines which parts of the app you can access.
                        </p>
                        <div style={s.roleGrid}>
                            {ROLE_OPTIONS.map(opt => (
                                <label
                                    key={opt.value}
                                    style={role === opt.value ? { ...s.roleCard, ...s.roleCardActive } : s.roleCard}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={opt.value}
                                        checked={role === opt.value}
                                        onChange={() => setRole(opt.value)}
                                        style={{ display: "none" }}
                                    />
                                    <span style={s.roleLabel}>{opt.label}</span>
                                    <span style={s.roleDesc}>{opt.desc}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* ── Availability ── */}
                    <div style={s.card}>
                        <h2 style={s.sectionTitle}>Availability</h2>
                        <label style={s.toggleRow}>
                            <div style={s.toggleInfo}>
                                <span style={s.toggleTitle}>Available to donate</span>
                                <span style={s.toggleDesc}>
                                    When enabled, you'll appear in donor searches for matching requests.
                                </span>
                            </div>
                            <div
                                style={isAvailable ? { ...s.toggle, ...s.toggleOn } : s.toggle}
                                onClick={() => setIsAvailable(v => !v)}
                                role="switch"
                                aria-checked={isAvailable}
                            >
                                <div style={isAvailable ? { ...s.toggleThumb, ...s.toggleThumbOn } : s.toggleThumb} />
                            </div>
                        </label>
                    </div>

                    {/* ── Error / success ── */}
                    {error && <div style={s.errorBox}>{error}</div>}
                    {saved && <div style={s.successBox}>Changes saved successfully!</div>}

                    {/* ── Save button ── */}
                    <div style={s.actions}>
                        <button type="submit" style={s.saveBtn} disabled={saving}>
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>

                </form>
            </div>
        </AppLayout>
    );
}

const s = {
    form: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           20,
        maxWidth:      680,
    },
    card: {
        background:   "#fff",
        borderRadius: 14,
        padding:      "22px 24px",
        boxShadow:    "0 1px 4px rgba(0,0,0,0.07)",
    },
    sectionTitle: {
        margin:       "0 0 16px",
        fontSize:     15,
        fontWeight:   700,
        color:        "#1e293b",
    },
    avatarSection: {
        display:    "flex",
        alignItems: "center",
        gap:        24,
    },
    avatarWrap: {
        position:     "relative" as const,
        width:        96,
        height:       96,
        borderRadius: "50%",
        cursor:       "pointer",
        flexShrink:   0,
        overflow:     "hidden",
    },
    avatarImg: {
        width:      "100%",
        height:     "100%",
        objectFit:  "cover" as const,
        display:    "block",
    },
    avatarPlaceholder: {
        width:          "100%",
        height:         "100%",
        background:     "linear-gradient(135deg, #c62828, #e53935)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        color:          "#fff",
        fontSize:       36,
        fontWeight:     700,
    },
    avatarOverlay: {
        position:        "absolute" as const,
        inset:           0,
        background:      "rgba(0,0,0,0.38)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        opacity:         0,
        transition:      "opacity 0.15s",
        borderRadius:    "50%",
        // Note: hover is handled inline via onMouseEnter/Leave if needed,
        // but for simplicity the camera icon is always faintly visible.
        // TODO: add CSS-in-JS hover or use a class for real hover.
    },
    cameraIcon: {
        fontSize: 22,
    },
    avatarMeta: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           4,
    },
    avatarHint: {
        margin:   0,
        fontSize: 14,
        color:    "#374151",
        fontWeight: 500,
    },
    avatarHintSub: {
        margin:   0,
        fontSize: 12,
        color:    "#94a3b8",
    },
    fileChosen: {
        margin:   0,
        fontSize: 12,
        color:    "#059669",
    },
    chooseBtn: {
        marginTop:    8,
        padding:      "7px 16px",
        background:   "#f1f5f9",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        fontSize:     13,
        fontWeight:   600,
        cursor:       "pointer",
        color:        "#334155",
        fontFamily:   "inherit",
        width:        "fit-content",
    },
    roleHint: {
        margin:     "0 0 14px",
        fontSize:   13,
        color:      "#64748b",
    },
    roleGrid: {
        display:   "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap:       10,
    },
    roleCard: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           4,
        padding:       "14px 16px",
        borderRadius:  10,
        border:        "2px solid #e2e8f0",
        cursor:        "pointer",
        transition:    "border-color 0.15s, background 0.15s",
        background:    "#f8fafc",
    },
    roleCardActive: {
        border:     "2px solid #c62828",
        background: "#fff5f5",
    },
    roleLabel: {
        fontSize:   14,
        fontWeight: 700,
        color:      "#1e293b",
    },
    roleDesc: {
        fontSize: 12,
        color:    "#64748b",
    },
    toggleRow: {
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        cursor:         "pointer",
        gap:            16,
    },
    toggleInfo: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           3,
    },
    toggleTitle: {
        fontSize:   14,
        fontWeight: 600,
        color:      "#1e293b",
    },
    toggleDesc: {
        fontSize: 13,
        color:    "#64748b",
    },
    toggle: {
        width:        46,
        height:       26,
        borderRadius: 13,
        background:   "#e2e8f0",
        position:     "relative" as const,
        flexShrink:   0,
        cursor:       "pointer",
        transition:   "background 0.2s",
    },
    toggleOn: {
        background: "#c62828",
    },
    toggleThumb: {
        position:     "absolute" as const,
        top:          3,
        left:         3,
        width:        20,
        height:       20,
        borderRadius: "50%",
        background:   "#fff",
        transition:   "transform 0.2s",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.2)",
    },
    toggleThumbOn: {
        transform: "translateX(20px)",
    },
    errorBox: {
        padding:      "12px 16px",
        background:   "#fff5f5",
        border:       "1px solid #fecaca",
        borderRadius: 10,
        color:        "#c62828",
        fontSize:     14,
        fontWeight:   500,
    },
    successBox: {
        padding:      "12px 16px",
        background:   "#f0fdf4",
        border:       "1px solid #bbf7d0",
        borderRadius: 10,
        color:        "#16a34a",
        fontSize:     14,
        fontWeight:   500,
    },
    actions: {
        display:    "flex",
        gap:        12,
    },
    saveBtn: {
        padding:      "11px 28px",
        background:   "#c62828",
        color:        "#fff",
        border:       "none",
        borderRadius: 9,
        fontSize:     15,
        fontWeight:   700,
        cursor:       "pointer",
        fontFamily:   "inherit",
    },
};
