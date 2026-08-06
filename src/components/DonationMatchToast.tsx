import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useConversations } from "../context/useConversations";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";

// Auto-dismiss delay in ms.
const AUTO_DISMISS_MS = 9000;

export default function DonationMatchToast() {
    const { pendingMatchNotification, clearMatchNotification } = useConversations();
    const navigate = useNavigate();

    // Keep the last notification around while the exit animation plays so the
    // card doesn't blank out before it finishes fading.
    const [visible,  setVisible]  = useState(false);
    const [progress, setProgress] = useState(100); // 100 → 0 over AUTO_DISMISS_MS

    const timerRef    = useRef<number | null>(null);
    const rafRef      = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);

    function dismiss() {
        setVisible(false);
        if (timerRef.current)  window.clearTimeout(timerRef.current);
        if (rafRef.current)    window.cancelAnimationFrame(rafRef.current);
        // Give the CSS transition time to finish before clearing the data.
        window.setTimeout(clearMatchNotification, 300);
    }

    function navigateAndDismiss() {
        if (!pendingMatchNotification) return;
        navigate(`/candidates?highlight=${pendingMatchNotification.donationRequestId}`);
        dismiss();
    }

    // Animate progress bar and auto-dismiss.
    function startCountdown() {
        startTimeRef.current = performance.now();
        setProgress(100);

        function tick(now: number) {
            const elapsed  = now - (startTimeRef.current ?? now);
            const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
            setProgress(remaining);
            if (remaining > 0) {
                rafRef.current = requestAnimationFrame(tick);
            }
        }
        rafRef.current = requestAnimationFrame(tick);

        timerRef.current = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    }

    useEffect(() => {
        if (!pendingMatchNotification) return;

        setVisible(true);
        startCountdown();

        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
            if (rafRef.current)   window.cancelAnimationFrame(rafRef.current);
        };
    }, [pendingMatchNotification]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!pendingMatchNotification) return null;

    const n = pendingMatchNotification;
    const bloodLabel = n.bloodTypeName ? bloodTypeNameStringToLabel(n.bloodTypeName) : "—";

    return createPortal(
        <div
            style={{
                ...s.toast,
                opacity:   visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(24px)",
            }}
            role="alert"
            aria-live="assertive"
        >
            {/* Dismiss button */}
            <button style={s.closeBtn} onClick={dismiss} aria-label="Dismiss">✕</button>

            {/* Header */}
            <div style={s.header}>
                <span style={s.pulse}>🩸</span>
                <span style={s.headerText}>Matching donor found!</span>
            </div>

            {/* Body */}
            <div style={s.body}>
                <p style={s.line}>
                    <strong>{n.donorName}</strong> just posted{" "}
                    <strong>{n.quantity ?? "?"} unit(s)</strong> of{" "}
                    <strong>{bloodLabel}</strong> blood that matches one of your requests.
                </p>
                {n.donorAddress && (
                    <p style={s.subLine}>📍 {n.donorAddress}</p>
                )}
            </div>

            {/* CTA */}
            <button style={s.ctaBtn} onClick={navigateAndDismiss}>
                View candidates →
            </button>

            {/* Progress bar */}
            <div style={s.progressTrack}>
                <div style={{ ...s.progressBar, width: `${progress}%` }} />
            </div>
        </div>,
        document.body
    );
}

const s = {
    toast: {
        position:      "fixed" as const,
        bottom:        24,
        right:         24,
        zIndex:        9999,
        width:         320,
        background:    "#fff",
        borderRadius:  14,
        boxShadow:     "0 8px 32px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)",
        border:        "1px solid #fecaca",
        overflow:      "hidden",
        transition:    "opacity 0.3s ease, transform 0.3s ease",
        fontFamily:    "system-ui, 'Segoe UI', Roboto, sans-serif",
    },
    closeBtn: {
        position:   "absolute" as const,
        top:        10,
        right:      10,
        background: "none",
        border:     "none",
        fontSize:   13,
        color:      "#94a3b8",
        cursor:     "pointer",
        lineHeight: 1,
        padding:    "2px 4px",
    },
    header: {
        display:     "flex",
        alignItems:  "center",
        gap:         8,
        padding:     "14px 36px 8px 14px",
        background:  "linear-gradient(90deg, #fef2f2 0%, #fff 100%)",
        borderBottom:"1px solid #fef2f2",
    },
    pulse: {
        fontSize:  18,
        animation: "none",
    },
    headerText: {
        fontWeight: 700,
        fontSize:   14,
        color:      "#c62828",
    },
    body: {
        padding: "10px 14px 4px",
    },
    line: {
        margin:   "0 0 4px",
        fontSize: 13,
        color:    "#1e293b",
        lineHeight: 1.5,
    },
    subLine: {
        margin:   0,
        fontSize: 12,
        color:    "#64748b",
    },
    ctaBtn: {
        display:      "block",
        width:        "calc(100% - 28px)",
        margin:       "10px 14px",
        padding:      "9px 0",
        background:   "#c62828",
        color:        "#fff",
        border:       "none",
        borderRadius: 8,
        fontSize:     13,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
        textAlign:    "center" as const,
    },
    progressTrack: {
        height:     3,
        background: "#fee2e2",
    },
    progressBar: {
        height:     "100%",
        background: "#c62828",
        transition: "width 0.1s linear",
    },
};
