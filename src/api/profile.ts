import { apiFetch } from "./client";
import type { UserProfileData } from "../types";

export interface CompleteOnboardingPayload {
    name:          string;
    businessRole:  number;  // BusinessRole enum value: 2=Donor, 3=Seeker, 4=DonorAndSeeker
    latitude?:     number;
    longitude?:    number;
    isAvailable:   boolean;
}

// POST /api/CompleteOnboarding
// Returns the newly created user profile (CompleteUserOnboardingViewModel).
// Store the response in UserContext/sessionStorage so the dashboard can read it.
export async function completeUserOnboarding(
    payload: CompleteOnboardingPayload,
): Promise<UserProfileData> {
    return apiFetch<UserProfileData>("/api/CompleteOnboarding", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}

// GET /api/CheckProfileExistence
// Called on app startup (main.tsx) to decide whether to route to /onboarding or /dashboard.
export async function checkProfileExistence(): Promise<{ completed: boolean }> {
    return apiFetch<{ completed: boolean }>("/api/CheckProfileExistence");
}

// GET /api/GetUserProfile
// Returns the full current-user profile including bloodTypeName and createdAt.
// The businessRole comes back as an integer; bloodTypeName as a string ("APositive" etc.).
export async function getUserProfile(): Promise<UserProfileData> {
    return apiFetch<UserProfileData>("/api/GetUserProfile");
}
