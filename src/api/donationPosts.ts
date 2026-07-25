import { apiFetch } from "./client";

export interface CreateDonationPostPayload {
    // TODO: BACKEND – bloodTypeName is the BloodTypeName integer enum value
    //   (APositive=0 … AbNegative=7). Update if the backend changes to string.
    bloodTypeName: number;
    quantity:      number;
}

// POST /api/donationpost/create-donation-post  (CanManageDonationPosts – Donor/DonorAndSeeker)
// TODO: BACKEND – The response shape is not yet documented; currently returns 200 OK.
//   Update the return type when the endpoint starts returning a DonationPostViewModel.
export async function createDonationPost(payload: CreateDonationPostPayload): Promise<void> {
    return apiFetch("/api/donationpost/create-donation-post", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}

// GET /api/donationpost/get-current-user-donation-posts  (CanManageDonationPosts – Donor/DonorAndSeeker)
// Returns the current user's donation posts.
// NOTE: The backend only populates bloodTypeName and quantity on each item;
//   donationPostId, donorUserId, donorName, donorAddress will be 0 / empty.
import type { DonationPostCandidateViewModel } from "../types";

export async function getMyDonationPosts(): Promise<DonationPostCandidateViewModel[]> {
    return apiFetch("/api/donationpost/get-current-user-donation-posts");
}
