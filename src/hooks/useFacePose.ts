import { useCallback, useEffect, useRef, useState } from "react";
import {
    FaceLandmarker,
    FilesetResolver,
    type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// Runs MediaPipe's Face Landmarker (Tasks API) against the live camera feed
// in-browser (WASM) to answer "which way is the user's head currently
// turned". This is ONLY used to decide *when* to auto-capture a frame during
// the verification pose sequence (Onboarding -> /verify-identity) — it is
// never trusted as proof by itself. The backend (face-verification-service,
// called from SubmitVerificationCommandHandler) independently re-runs
// detection on the submitted frames and is the actual gate.

export type FacePose = "Center" | "Left" | "Right" | "Up" | "Ambiguous";

export type FacePoseStatus =
    | "idle"
    | "loading-model"
    | "requesting-camera"
    | "ready"
    | "error";

// Degrees — mirrors the thresholds in face-verification-service/app.py so
// the frontend's "you're centered now" feedback roughly agrees with what the
// backend will actually accept. Not security-critical if these drift from
// the backend's values (the backend re-checks independently either way) —
// just calibrate them together for a less confusing UX.
const YAW_THRESHOLD = 15;
const PITCH_UP_THRESHOLD = -12;
const CENTER_TOLERANCE = 10;

// MediaPipe's `Matrix` result type documents its `data` field as
// column-major. If yaw/pitch come out looking transposed/wrong during
// testing (e.g. Left and Right swapped in a way flipping the camera doesn't
// explain), this is the first thing to double-check.
function matrixElement(data: number[], row: number, col: number): number {
    return data[col * 4 + row];
}

function rotationMatrixToEuler(data: number[]): { yaw: number; pitch: number; roll: number } {
    const m00 = matrixElement(data, 0, 0);
    const m10 = matrixElement(data, 1, 0);
    const m20 = matrixElement(data, 2, 0);
    const m21 = matrixElement(data, 2, 1);
    const m22 = matrixElement(data, 2, 2);

    const sy = Math.sqrt(m00 * m00 + m10 * m10);

    // Real-device testing showed the textbook Rz*Ry*Rx names for these three
    // don't match MediaPipe's actual face-camera axis convention (X=right,
    // Y=up, Z=forward). Confirmed so far:
    //   - atan2(-m20, sy) tracks real left/right head turns (yaw, rotation
    //     about the vertical Y axis) - a pure left/right turn swung this
    //     ~50 degrees while leaving the other two both near 0.
    //   - atan2(m10, m00) stayed near 0 through BOTH a pure left/right turn
    //     AND an extreme up/down tilt - consistent with this being roll
    //     (ear-to-shoulder tilt about the depth/Z axis), which neither test
    //     actually performed.
    //   - atan2(m21, m22) was therefore never exercised until the up/down
    //     tilt test, where it's the only remaining candidate for real pitch
    //     (rotation about the lateral/X axis) - used below, but its SIGN
    //     hasn't been confirmed by a live "does it go negative when tilting
    //     up" test yet. If PITCH_UP_THRESHOLD in classifyPose triggers
    //     backwards (registers "Up" when tilting down, or never at all),
    //     flip this to `-Math.atan2(m21, m22)`.
    // Keep in sync with the identical mapping in rotation_matrix_to_euler()
    // in face-verification-service/app.py.
    const yaw = Math.atan2(-m20, sy) * (180 / Math.PI);
    const pitch = Math.atan2(m21, m22) * (180 / Math.PI);
    const roll = Math.atan2(m10, m00) * (180 / Math.PI);

    return { yaw, pitch, roll };
}

// The <video> preview is shown mirrored via CSS (transform: scaleX(-1)) for
// a natural "looking in a mirror" feel, but that's a display-only transform —
// detectForVideo() reads the RAW, unmirrored camera frame underneath, which
// has the same orientation as a photo taken by someone facing the subject:
// when the subject turns their head to their own left, their face moves
// toward the RIGHT side of that raw frame, not the left. Confirmed by
// real-device testing that the naive "unmirrored == subject's-left-on-the-
// left" assumption was backwards - Left/Right are swapped here from what
// you'd guess at a glance. Keep this in sync with classify_pose() in
// face-verification-service/app.py, which does the same raw-frame reasoning
// server-side and must agree with this or every submission would fail
// pose_mismatch.
function classifyPose(yaw: number, pitch: number): FacePose {
    if (pitch < PITCH_UP_THRESHOLD) return "Up";
    if (yaw < -YAW_THRESHOLD) return "Right";
    if (yaw > YAW_THRESHOLD) return "Left";
    if (Math.abs(yaw) <= CENTER_TOLERANCE && Math.abs(pitch) <= CENTER_TOLERANCE) return "Center";
    return "Ambiguous";
}

const WASM_BASE_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_ASSET_PATH =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface UseFacePoseResult {
    videoRef:      React.RefObject<HTMLVideoElement | null>;
    status:        FacePoseStatus;
    error:         string | null;
    faceDetected:  boolean;
    currentPose:   FacePose | null;
    // Raw angles behind currentPose, in degrees - null whenever no face is
    // detected. TEMPORARY: exposed so VerifyIdentity can render a live debug
    // readout while calibrating YAW_THRESHOLD/PITCH_UP_THRESHOLD against a
    // real webcam. Fine to remove both once the thresholds are confirmed good.
    debugYaw:      number | null;
    debugPitch:    number | null;
    // Increments on every detection tick (~every RAF frame), whether or not
    // the pose/faceDetected values actually changed. Consumers that need to
    // count CONSECUTIVE matching frames (e.g. "hold this pose for N frames")
    // must include this in their effect's dependency array - currentPose
    // alone won't re-fire the effect while a pose is held steady, since
    // React skips re-running effects whose listed dependencies are unchanged
    // between renders, and a held pose is by definition not changing.
    frameTick:     number;
    start:         () => Promise<void>;
    stop:          () => void;
    // Draws the current video frame to an offscreen canvas and returns a
    // JPEG data URL — this is what gets sent as a frame's imageBase64.
    captureFrame:  () => string | null;
}

export function useFacePose(): UseFacePoseResult {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const landmarkerRef = useRef<FaceLandmarker | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);

    const [status, setStatus] = useState<FacePoseStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [faceDetected, setFaceDetected] = useState(false);
    const [currentPose, setCurrentPose] = useState<FacePose | null>(null);
    const [debugYaw, setDebugYaw] = useState<number | null>(null);
    const [debugPitch, setDebugPitch] = useState<number | null>(null);
    const [frameTick, setFrameTick] = useState(0);

    const stop = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStatus("idle");
        setFaceDetected(false);
        setCurrentPose(null);
        setDebugYaw(null);
        setDebugPitch(null);
    }, []);

    const detectLoop = useCallback(() => {
        const video = videoRef.current;
        const landmarker = landmarkerRef.current;
        if (!video || !landmarker || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        let result: FaceLandmarkerResult;
        try {
            result = landmarker.detectForVideo(video, performance.now());
        } catch {
            rafRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        const matrix = result.facialTransformationMatrixes?.[0];
        if (!result.faceLandmarks?.length || !matrix) {
            setFaceDetected(false);
            setCurrentPose(null);
            setDebugYaw(null);
            setDebugPitch(null);
        } else {
            setFaceDetected(true);
            const { yaw, pitch } = rotationMatrixToEuler(matrix.data);
            setCurrentPose(classifyPose(yaw, pitch));
            setDebugYaw(yaw);
            setDebugPitch(pitch);
        }
        // Always bump, even when nothing above changed value (e.g. holding a
        // steady pose, or steadily not finding a face) - this is what lets
        // consumers' effects re-run every detection tick instead of only on
        // actual pose transitions. See the frameTick doc comment above.
        setFrameTick(t => t + 1);

        rafRef.current = requestAnimationFrame(detectLoop);
    }, []);

    const start = useCallback(async () => {
        setError(null);

        try {
            if (!landmarkerRef.current) {
                setStatus("loading-model");
                const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
                landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: MODEL_ASSET_PATH,
                        delegate: "GPU",
                    },
                    runningMode: "VIDEO",
                    numFaces: 1,
                    outputFacialTransformationMatrixes: true,
                });
            }

            setStatus("requesting-camera");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false,
            });
            streamRef.current = stream;

            if (!videoRef.current) {
                throw new Error("Video element not mounted.");
            }
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            setStatus("ready");
            rafRef.current = requestAnimationFrame(detectLoop);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Couldn't start the camera.";
            setError(message);
            setStatus("error");
            stop();
        }
    }, [detectLoop, stop]);

    const captureFrame = useCallback((): string | null => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return null;

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.85);
    }, []);

    // Stop the camera and free the landmarker on unmount — leaving
    // getUserMedia running after navigating away keeps the camera's "in use"
    // indicator on and leaks the WASM detector.
    useEffect(() => {
        return () => {
            stop();
            landmarkerRef.current?.close();
            landmarkerRef.current = null;
        };
    }, [stop]);

    return {
        videoRef, status, error, faceDetected, currentPose,
        debugYaw, debugPitch, frameTick, start, stop, captureFrame,
    };
}
