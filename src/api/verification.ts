import { apiFetch } from "./client";
import type { SubmitVerificationResponse, VerificationStatusResponse } from "../types";

export interface VerificationFramePayload {
    pose:        string; // "Center" | "Left" | "Right" | "Up"
    imageBase64: string;
}

export interface SubmitVerificationPayload {
    frames: VerificationFramePayload[];
}

// GET /api/verification/status
// Called from Onboarding when it needs to know whether the user has already
// passed verification (e.g. after returning from /verify-identity, or on a
// fresh mount / page refresh mid-flow), and how many attempts they've used.
export async function getVerificationStatus(): Promise<VerificationStatusResponse> {
    return apiFetch<VerificationStatusResponse>("/api/verification/status");
}

// POST /api/verification/submit
// Sends the captured pose-sequence frames for server-side re-verification -
// see face-verification-service. The frontend's own MediaPipe check only
// decided *when* to capture each frame; this call is what actually decides
// pass/fail.
export async function submitVerification(
    payload: SubmitVerificationPayload,
): Promise<SubmitVerificationResponse> {
    return apiFetch<SubmitVerificationResponse>("/api/verification/submit", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}
