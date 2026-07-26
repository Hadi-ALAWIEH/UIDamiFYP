import { apiFetch } from "./client";
import type { AllConversationsViewModel, MessageViewModel } from "../types";

// GET /api/conversation/get-all-conversations  (CanAccessConversations – Donor/Seeker/ManageAccount)
export async function getAllConversations(): Promise<AllConversationsViewModel> {
    return apiFetch("/api/conversation/get-all-conversations");
}

// GET /api/conversation/{conversationId}/messages  (CanAccessConversations)
// Returns the full message history for a conversation the caller participates in.
// Prefer using JoinConversation (SignalR) which returns history + subscribes in one call.
export async function getConversationMessages(conversationId: number): Promise<MessageViewModel[]> {
    return apiFetch(`/api/conversation/${conversationId}/messages`);
}
