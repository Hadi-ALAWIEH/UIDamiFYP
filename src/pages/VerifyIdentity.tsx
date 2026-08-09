import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFacePose, type FacePose } from "../hooks/useFacePose";
import { submitVerification } from "../api/verification";
import { VerificationStatus } from "../types";

// ── Pose sequence ──────────────────────────────────────────────────────────

const ALL_POSES: FacePose[] = ["Center", "Left", "Right", "Up"];

// Frames the live detected pose must match the target pose for
// consecutively before it's auto-captured. ~12 frames at a typical camera
// framerate is short enough not to feel laggy but long enough to filter out
// briefly passing through the target angle while turning past it.
const HOLD_FRAMES_REQUIRED = 12;

// Randomized per attempt (not just per session) — a pre-recorded video of
// someone doing "center, left, right, up" in that exact order is much less
// useful to replay if the requested order changes every time.
function shuffledPoses(): FacePose[] {
    const arr = [...ALL_POSES];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const POSE_LABELS: Record<FacePose, string> = {
    Center:    "Face the camera",
    Left:      "Turn your head left",
    Right:     "Turn your head right",
    Up:        "Tilt your head up",
    Ambiguous: "Hold still…",
};

const POSE_ICONS: Record<FacePose, string> = {
    Center:    "🎯",
    Left:      "⬅️",
    Right:     "➡️",
    Up:        "⬆️",
    Ambiguous: "…",
};

// Maps the backend's machine-readable failure_reason to something a user
// can actually act on. Keep in sync with face-verification-service/app.py
// and SubmitVerificationCommandHandler's own "verification_error" fallback.
const FAILURE_MESSAGES: Record<string, string> = {
    no_frames:               "No frames were captured. Let's try again.",
    invalid_image:           "One of the captured frames couldn't be read. Let's try again.",
    static_image_detected:   "The captured frames looked too similar to each other — make sure you're actually moving your head for each pose.",
    no_face_detected:        "We couldn't find a face in one of the frames. Make sure you're well-lit and centered in the frame.",
    multiple_faces_detected: "More than one face was detected. Make sure you're the only person in frame.",
    pose_mismatch:           "One of the poses didn't match what was asked. Let's try the sequence again.",
    verification_error:      "Something went wrong on our end while checking your frames. Please try again.",
};

type Stage =
    | "consent"
    | "starting"
    | "capturing"
    | "submitting"
    | "success"
    | "failed"
    | "camera-error";

interface CapturedFrame {
    pose:        FacePose;
    imageBase64: string;
}

export default function VerifyIdentity() {
    const navigate = useNavigate();
    const {
        videoRef, status: cameraStatus, error: cameraError,
        faceDetected, currentPose, debugYaw, debugPitch, frameTick, start, stop, captureFrame,
    } = useFacePose();

    const [stage,           setStage]           = useState<Stage>("consent");
    const [poseSequence,    setPoseSequence]    = useState<FacePose[]>(() => shuffledPoses());
    const [poseIndex,       setPoseIndex]       = useState(0);
    const [capturedFrames,  setCapturedFrames]  = useState<CapturedFrame[]>([]);
    const [failureReason,   setFailureReason]   = useState<string | null>(null);
    const [attemptCount,    setAttemptCount]    = useState<number | null>(null);
    const [submitError,     setSubmitError]     = useState<string | null>(null);

    const holdCountRef        = useRef(0);
    const capturedForIndexRef = useRef(-1);

    const targetPose = poseSequence[poseIndex];
    const isHolding  = stage === "capturing" && faceDetected && currentPose === targetPose;

    // Reflect the camera hook's own status once we've asked it to start.
    useEffect(() => {
        if (stage !== "starting") return;
        if (cameraStatus === "ready") setStage("capturing");
        if (cameraStatus === "error") setStage("camera-error");
    }, [cameraStatus, stage]);

    // Auto-capture: once the live detected pose matches the current target
    // for HOLD_FRAMES_REQUIRED consecutive frames, grab a frame and advance.
    //
    // frameTick MUST be a dependency here, and currentPose/faceDetected
    // alone are not enough: once a pose is being held steady, currentPose
    // stops changing value between detection ticks, and React skips
    // re-running an effect whose listed dependencies didn't change - so
    // without frameTick this effect fires exactly once per pose transition
    // and then silently stops counting, freezing on "Hold still…" forever
    // no matter how long the pose is actually held. frameTick increments on
    // every detection tick regardless of whether the pose changed, which is
    // what makes this effect actually re-evaluate every frame.
    useEffect(() => {
        if (stage !== "capturing") return;
        if (capturedForIndexRef.current === poseIndex) return; // already captured this step

        if (faceDetected && currentPose === targetPose) {
            holdCountRef.current += 1;
        } else {
            holdCountRef.current = 0;
        }

        if (holdCountRef.current < HOLD_FRAMES_REQUIRED) return;

        const frame = captureFrame();
        holdCountRef.current = 0;
        if (!frame) return;

        capturedForIndexRef.current = poseIndex;
        const next = [...capturedFrames, { pose: targetPose, imageBase64: frame }];
        setCapturedFrames(next);

        if (poseIndex + 1 >= poseSequence.length) {
            stop();
            setStage("submitting");
        } else {
            setPoseIndex(i => i + 1);
        }
        // capturedFrames deliberately omitted — we read/append it directly above
        // to avoid re-running this effect on every frame array identity change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameTick, currentPose, faceDetected, stage, poseIndex, targetPose, captureFrame, stop]);

    // Submit once every pose in the sequence has a captured frame.
    useEffect(() => {
        if (stage !== "submitting") return;
        if (capturedFrames.length < poseSequence.length) return;

        let cancelled = false;
        (async () => {
            try {
                const result = await submitVerification({
                    frames: capturedFrames.map(f => ({ pose: f.pose, imageBase64: f.imageBase64 })),
                });
                if (cancelled) return;

                setAttemptCount(result.attemptCount);

                if (result.status === VerificationStatus.Verified) {
                    setStage("success");
                } else {
                    setFailureReason(result.failureReason);
                    setStage("failed");
                }
            } catch (err) {
                if (cancelled) return;
                const message = err instanceof Error
                    ? err.message
                    : "Something went wrong submitting your verification.";
                setSubmitError(message);
                setStage("failed");
            }
        })();

        return () => { cancelled = true; };
    }, [stage, capturedFrames, poseSequence.length]);

    // On success, hand control back to Onboarding after a short beat so the
    // user actually sees the confirmation instead of an instant redirect.
    useEffect(() => {
        if (stage !== "success") return;
        const id = window.setTimeout(() => navigate("/onboarding"), 1200);
        return () => window.clearTimeout(id);
    }, [stage, navigate]);

    async function handleStart() {
        setStage("starting");
        setFailureReason(null);
        setSubmitError(null);
        setAttemptCount(null);
        setCapturedFrames([]);
        setPoseIndex(0);
        capturedForIndexRef.current = -1;
        holdCountRef.current = 0;
        setPoseSequence(shuffledPoses());

        await start();
    }

    function handleBackToOnboarding() {
        stop();
        navigate("/onboarding");
    }

    // ── Render ───────────────────────────────────────────────────────────

    if (stage === "consent") {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <div style={s.iconCircle}>🪪</div>
                    <h1 style={s.title}>Verify It's You</h1>
                    <p style={s.subtitle}>
                        Before you can start using DamiFYP, we need to confirm a real
                        person is behind this account.
                    </p>

                    <div style={s.infoBox}>
                        <p style={s.infoText}>
                            Your camera will turn on and ask you to face the camera, then
                            turn your head a few different ways, in a random order — similar
                            to how Instagram or other apps verify a live face.
                        </p>
                        <p style={s.infoText}>
                            We only keep the result (pass/fail) and a short log of the
                            attempt — the actual photos are processed for the check and then
                            discarded, not stored.
                        </p>
                    </div>

                    <button style={s.primaryBtn} onClick={handleStart}>
                        Start Verification
                    </button>
                    <button style={s.linkBtn} onClick={handleBackToOnboarding}>
                        Cancel and go back
                    </button>
                </div>
            </div>
        );
    }

    if (stage === "camera-error") {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <div style={s.iconCircle}>⚠️</div>
                    <h1 style={s.title}>Couldn't Access Your Camera</h1>
                    <p style={s.subtitle}>
                        {cameraError ?? "We weren't able to start your camera."}
                    </p>
                    <p style={s.infoText}>
                        Make sure you've allowed camera access for this site, then try again.
                    </p>
                    <button style={s.primaryBtn} onClick={handleStart}>
                        Try Again
                    </button>
                    <button style={s.linkBtn} onClick={handleBackToOnboarding}>
                        Cancel and go back
                    </button>
                </div>
            </div>
        );
    }

    if (stage === "failed") {
        // No attempt cap - always offer "Try Again". attemptCount is shown
        // purely as an informational counter, never used to block anything.
        const message = submitError
            ?? (failureReason ? FAILURE_MESSAGES[failureReason] : null)
            ?? "Verification didn't succeed. Let's try again.";

        return (
            <div style={s.page}>
                <div style={s.card}>
                    <div style={s.iconCircle}>❌</div>
                    <h1 style={s.title}>Verification Didn't Pass</h1>
                    <p style={s.subtitle}>{message}</p>
                    {attemptCount !== null && (
                        <p style={s.attemptHint}>Attempt {attemptCount}</p>
                    )}

                    <button style={s.primaryBtn} onClick={handleStart}>
                        Try Again
                    </button>
                    <button style={s.linkBtn} onClick={handleBackToOnboarding}>
                        Cancel and go back
                    </button>
                </div>
            </div>
        );
    }

    if (stage === "success") {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <div style={s.iconCircle}>✅</div>
                    <h1 style={s.title}>You're Verified</h1>
                    <p style={s.subtitle}>Taking you back to finish setting up your profile…</p>
                </div>
            </div>
        );
    }

    // "starting" | "submitting" | "capturing" all render the camera view -
    // "starting"/"submitting" just overlay a status message on top of it.
    return (
        <div style={s.page}>
            <div style={s.captureCard}>
                <div style={s.videoWrap}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={s.video}
                    />

                    {stage === "capturing" && (
                        <div style={s.overlay}>
                            <div style={s.poseIcon}>{POSE_ICONS[isHolding ? "Ambiguous" : targetPose]}</div>
                            <div style={s.poseLabel}>
                                {isHolding ? "Hold still…" : POSE_LABELS[targetPose]}
                            </div>
                            {!faceDetected && (
                                <div style={s.noFaceHint}>Make sure your face is in frame</div>
                            )}
                        </div>
                    )}

                    {/* TEMPORARY debug readout for calibrating YAW_THRESHOLD/
                        PITCH_UP_THRESHOLD in useFacePose.ts against a real
                        webcam — safe to delete once thresholds are confirmed
                        good, along with debugYaw/debugPitch in useFacePose. */}
                    {stage === "capturing" && (
                        <div style={s.debugReadout}>
                            face: {faceDetected ? "yes" : "no"} · pose: {currentPose ?? "—"}<br />
                            yaw: {debugYaw !== null ? debugYaw.toFixed(1) : "—"}° ·{" "}
                            pitch: {debugPitch !== null ? debugPitch.toFixed(1) : "—"}°
                        </div>
                    )}

                    {(stage === "starting" || stage === "submitting") && (
                        <div style={s.overlay}>
                            <div style={s.poseLabel}>
                                {stage === "starting" ? "Starting camera…" : "Checking your verification…"}
                            </div>
                        </div>
                    )}
                </div>

                <div style={s.progressRow}>
                    {poseSequence.map((_pose, i) => (
                        <div
                            key={i}
                            style={{
                                ...s.progressDot,
                                background: i < capturedFrames.length
                                    ? "#c62828"
                                    : i === poseIndex
                                        ? "#f2b8b8"
                                        : "#e2e8f0",
                            }}
                        />
                    ))}
                </div>

                <button style={s.linkBtn} onClick={handleBackToOnboarding}>
                    Cancel and go back
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
        textAlign:     "center" as const,
    },
    captureCard: {
        width:         "100%",
        maxWidth:      480,
        padding:       24,
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
        margin:     0,
    },
    subtitle: {
        color:     "#64748b",
        fontSize:  14,
        margin:    0,
    },
    infoBox: {
        background:    "#f8fafc",
        border:        "1px solid #e2e8f0",
        borderRadius:  10,
        padding:       "14px 16px",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           8,
        textAlign:     "left" as const,
    },
    infoText: {
        fontSize: 12.5,
        color:    "#475569",
        margin:   0,
        lineHeight: 1.5,
    },
    attemptHint: {
        fontSize: 12,
        color:    "#94a3b8",
        margin:   0,
    },
    primaryBtn: {
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
    linkBtn: {
        background:  "none",
        border:      "none",
        color:       "#94a3b8",
        fontSize:    13,
        cursor:      "pointer",
        textAlign:   "center" as const,
        fontFamily:  "inherit",
    },
    videoWrap: {
        position:     "relative" as const,
        width:        "100%",
        aspectRatio:  "4 / 3",
        borderRadius: 14,
        overflow:     "hidden",
        background:   "#0f172a",
    },
    video: {
        width:      "100%",
        height:     "100%",
        objectFit:  "cover" as const,
        // Mirrored for a natural "looking in a mirror" feel - purely a
        // display transform, doesn't change the underlying frame pixels
        // captureFrame() reads from.
        transform:  "scaleX(-1)",
    },
    // TEMPORARY - see the comment where this is used above.
    debugReadout: {
        position:      "absolute" as const,
        top:            8,
        left:           8,
        padding:        "4px 8px",
        borderRadius:   6,
        background:     "rgba(0,0,0,0.6)",
        color:          "#4ade80",
        fontSize:       11,
        fontFamily:     "monospace",
        lineHeight:     1.4,
        pointerEvents:  "none" as const,
    },
    overlay: {
        position:       "absolute" as const,
        inset:          0,
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        justifyContent: "center",
        gap:            8,
        background:     "rgba(15,23,42,0.35)",
        color:          "#fff",
        textAlign:      "center" as const,
        padding:        16,
    },
    poseIcon: {
        fontSize: 40,
    },
    poseLabel: {
        fontSize:   16,
        fontWeight: 600,
    },
    noFaceHint: {
        fontSize: 12.5,
        opacity:  0.85,
    },
    progressRow: {
        display:        "flex",
        justifyContent: "center",
        gap:            8,
    },
    progressDot: {
        width:        10,
        height:       10,
        borderRadius: "50%",
    },
};
