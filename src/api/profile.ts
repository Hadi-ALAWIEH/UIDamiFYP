import { apiFetch } from "./client";
import type { UserProfileData } from "../types";
import { keycloak } from "../auth/Keycloak";

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

// PUT /api/UpdateProfile (multipart/form-data)
// Must NOT set Content-Type — the browser sets it with the multipart boundary.
export async function updateUserProfile(formData: FormData): Promise<UserProfileData> {
    const base = import.meta.env.VITE_API_URL ?? "https://localhost:7212";
    const res = await fetch(`${base}/api/UpdateProfile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${keycloak.token}` },
        body: formData,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
}
