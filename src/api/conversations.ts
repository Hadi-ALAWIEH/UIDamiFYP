import { apiFetch } from "./client";
import type { AllConversationsViewModel } from "../types";

// GET /api/conversation/get-all-conversations  (CanAccessConversations – Donor/Seeker/ManageAccount)
export async function getAllConversations(): Promise<AllConversationsViewModel> {
    return apiFetch("/api/conversation/get-all-conversations");
}

// TODO: BACKEND – Add getMessages(conversationId) when a messages endpoint is available.
//   Expected endpoint: GET /api/conversation/{id}/messages
// TODO: BACKEND – Add sendMessage(conversationId, content) when available.
//   Expected endpoint: POST /api/conversation/{id}/messages { content: string }
