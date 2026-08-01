import { apiFetch } from "./client";
import type { BotMessageViewModel } from "../types";

// GET /api/BotAssistant/messages  (CanUseAssistant)
// History for the "Ask our bot" chat window on load.
export async function getBotMessages(): Promise<BotMessageViewModel[]> {
    return apiFetch("/api/BotAssistant/messages");
}

// POST /api/BotAssistant/messages  (CanUseAssistant)
// Sends a message and waits for the assistant's reply (plain request/response —
// no SignalR here, since a reply always answers the exact request that produced it).
export async function sendBotMessage(message: string): Promise<BotMessageViewModel> {
    return apiFetch("/api/BotAssistant/messages", {
        method: "POST",
        body: JSON.stringify({ message }),
    });
}
