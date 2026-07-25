// import { keycloak } from "../auth/Keycloak.ts";

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE TYPES
// TODO: BACKEND – Align these interfaces with the exact JSON your API returns.
// ─────────────────────────────────────────────────────────────────────────────

import {keycloak} from "../auth/Keycloak.ts";

export interface UserProfileResponse {
    name: string;
    /** 1 = Donor  |  2 = Seeker  |  3 = Both */
    businessRole: number;
    bloodType?: string;    // e.g. "A+", "O-", "B+"
    isAvailable?: boolean; // donors: currently available to donate
}

export interface DonationRequest {
    id: string;
    bloodType: string;
    urgency: "urgent" | "normal";
    status: "pending" | "fulfilled" | "cancelled";
    requestedAt: string;  // ISO 8601 date-time from backend
    hospital?: string;
    notes?: string;
}

export interface DonationPost {
    id: string;
    bloodType: string;
    status: "active" | "inactive";
    postedAt: string;     // ISO 8601 date-time from backend
    location?: string;
    respondedCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API FUNCTIONS
// TODO: BACKEND – Uncomment and adjust the fetch calls below.
//   Replace "https://localhost:7212" with your base URL or an env variable.
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfileResponse> {
    // TODO: BACKEND – uncomment when endpoint is ready
    const res = await fetch("https://localhost:7212/api/GetUserProfile", {
        headers: { Authorization: `Bearer ${keycloak.token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch user profile");
    return res.json();

    // Placeholder — remove once the real fetch above is live
    // throw new Error("getUserProfile: not yet wired to backend");
}

export async function getDonationRequests(): Promise<DonationRequest[]> {
    // TODO: BACKEND – uncomment when endpoint is ready
    const res = await fetch("https://localhost:7212/api/DonationRequest/current-user-donation-requests", {
        headers: { Authorization: `Bearer ${keycloak.token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch donation requests");
    return res.json();
}

export async function getDonationPosts(): Promise<DonationPost[]> {
    // TODO: BACKEND – uncomment when endpoint is ready
    // const res = await fetch("https://localhost:7212/api/GetMyDonationPosts", {
    //     headers: { Authorization: `Bearer ${keycloak.token}` },
    // });
    // if (!res.ok) throw new Error("Failed to fetch donation posts");
    // return res.json();

    throw new Error("getDonationPosts: not yet wired to backend");
}
