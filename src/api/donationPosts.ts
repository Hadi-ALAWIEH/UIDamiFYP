import { apiFetch } from "./client";
import type { DonationPostCandidateViewModel } from "../types";

export interface CreateDonationPostPayload {
    bloodTypeName: number;  // BloodTypeName integer enum (APositive=0 … AbNegative=7)
    quantity:      number;
    address?:      string;
    latitude?:     number;
    longitude?:    number;
}

// POST /api/donationpost/create-donation-post  (CanManageDonationPosts – Donor/DonorAndSeeker)
export async function createDonationPost(payload: CreateDonationPostPayload): Promise<void> {
    return apiFetch("/api/donationpost/create-donation-post", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}

// GET /api/donationpost/get-current-user-donation-posts  (CanManageDonationPosts – Donor/DonorAndSeeker)
export async function getMyDonationPosts(): Promise<DonationPostCandidateViewModel[]> {
    return apiFetch("/api/donationpost/get-current-user-donation-posts");
}

// DELETE /api/donationpost/{id}  (CanManageDonationPosts – Donor/DonorAndSeeker)
// Blocked with 400 if the post has any Match records (active or historical).
export async function deleteDonationPost(id: number): Promise<void> {
    return apiFetch(`/api/donationpost/${id}`, { method: "DELETE" });
}
