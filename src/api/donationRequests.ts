import { apiFetch } from "./client";
import type {
    DonationRequestViewModel,
    DonationRequestMatchCandidatesViewModel,
    DonorFeedbackPayload,
} from "../types";

// ── Request payloads ────────────────────────────────────────────────────────

export interface CreateDonationRequestPayload {
    // Backend CreateDonationRequestCommand.BloodTypeName is string? and uses Enum.TryParse internally.
    // Must be the enum name exactly: "APositive", "ANegative", "BPositive", "BNegative",
    // "OPositive", "ONegative", "AbPositive", "AbNegative"
    bloodTypeName:  string;
    quantity:       number;
    latitude?:      number;
    longitude?:     number;
    address?:       string;
    urgency:        number;   // DonationRequestUrgency: 0=Low, 1=Medium, 2=High
    neededByDate?:  string;   // ISO 8601, e.g. "2026-08-01T00:00:00Z"
}

export interface UpdateDonationRequestPayload {
    bloodTypeName:  string;  // same as Create — enum name string
    quantity:       number;
    latitude?:      number;
    longitude?:     number;
    address?:       string;
    urgency:        number;   // DonationRequestUrgency: 0=Low, 1=Medium, 2=High
    neededByDate?:  string;   // ISO 8601
}

export interface ConfirmMatchPayload {
    donationRequestId: number;
    donationPostId:    number;
}

// ── API calls ───────────────────────────────────────────────────────────────

// POST /api/donationrequest  (CanManageDonationRequests – Seeker)
// Creates the request and auto-matches available donation posts.
export async function createDonationRequest(
    payload: CreateDonationRequestPayload,
): Promise<DonationRequestMatchCandidatesViewModel> {
    return apiFetch("/api/donationrequest", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}

// GET /api/donationrequest/current-user-donation-requests  (Seeker)
// Returns only the current user's requests.
export async function getMyDonationRequests(): Promise<DonationRequestViewModel[]> {
    return apiFetch("/api/donationrequest/current-user-donation-requests");
}

// GET /api/donationrequest/{id}  (Seeker or Admin)
export async function getDonationRequest(id: number): Promise<DonationRequestViewModel> {
    return apiFetch(`/api/donationrequest/${id}`);
}

// GET /api/donationrequest  (CanViewAvailableDonationRequests – Donor only)
// Returns all available (pending) requests so donors can see what is needed.
export async function getAllDonationRequests(): Promise<DonationRequestViewModel[]> {
    return apiFetch("/api/donationrequest");
}

// PUT /api/donationrequest/{id}  (Seeker)
export async function updateDonationRequest(
    id:      number,
    payload: UpdateDonationRequestPayload,
): Promise<DonationRequestViewModel> {
    return apiFetch(`/api/donationrequest/${id}`, {
        method: "PUT",
        body:   JSON.stringify(payload),
    });
}

// DELETE /api/donationrequest/{id}  (Seeker)
export async function deleteDonationRequest(id: number): Promise<void> {
    return apiFetch(`/api/donationrequest/${id}`, { method: "DELETE" });
}

// POST /api/donationrequest/confirm-match  (Seeker)
// Confirms a matched donor post; creates a Match + Conversation automatically.
export async function confirmMatch(payload: ConfirmMatchPayload): Promise<void> {
    return apiFetch("/api/donationrequest/confirm-match", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}

// POST /api/donationrequest/{id}/cancel  (Seeker)
// Cancels a matched request; notifies the donor by email and SignalR.
export async function cancelDonationRequest(id: number): Promise<void> {
    return apiFetch(`/api/donationrequest/${id}/cancel`, { method: "POST" });
}

// POST /api/donationrequest/{id}/confirm-donation  (Seeker)
// Marks the request + matched post as Completed; awards points to donor.
export async function confirmDonation(id: number): Promise<void> {
    return apiFetch(`/api/donationrequest/${id}/confirm-donation`, { method: "POST" });
}

// GET /api/donationpost/get-candidates-{id}
// Fetches (or refreshes) the list of matching donation posts for a request.
export async function getCandidatesForRequest(
    donationRequestId: number,
): Promise<DonationRequestMatchCandidatesViewModel> {
    return apiFetch(`/api/donationpost/get-candidates-${donationRequestId}`);
}

// POST /api/donationrequest/{id}/feedback  (Seeker)
// Submits a star rating + optional comment for the donor after donation is confirmed.
export async function submitDonorFeedback(id: number, payload: DonorFeedbackPayload): Promise<void> {
    return apiFetch(`/api/donationrequest/${id}/feedback`, {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}
