import { createContext, useContext, type MutableRefObject } from "react";
import type { HubConnection } from "@microsoft/signalr";
import type { ConversationViewModel, MessageViewModel } from "../types";

// This file intentionally exports NO React components — only a plain
// Context object, a type, and a hook. Vite's Fast Refresh can only safely
// hot-swap a file that exports exclusively components; mixing a component
// (ConversationsProvider) with a hook (useConversations) in one file made
// every edit fail to Fast Refresh and silently leave the browser tab
// running stale connection logic (see ConversationsContext.tsx for the
// actual Provider component).

export interface ConversationsContextValue {
    conversations:        ConversationViewModel[];
    conversationsLoading: boolean;
    connStatus:           "connecting" | "connected" | "disconnected";
    connRef:              MutableRefObject<HubConnection | null>;
    // The Conversations page sets this to the currently-open conversation's id
    // (and back to null when nothing is open / the page unmounts), so the
    // provider knows not to count an actively-open chat as "unread".
    activeIdRef:           MutableRefObject<number | null>;
    // Every message received via SignalR, most recent last — the Conversations
    // page watches this to append new messages to whichever chat is open.
    latestMessage:         MessageViewModel | null;
    unreadCount:           number;
    isUnread:              (conv: ConversationViewModel) => boolean;
    markConversationSeen:  (conversationId: number, at?: string) => void;
    reload:                () => void;
}

export const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function useConversations(): ConversationsContextValue {
    const ctx = useContext(ConversationsContext);
    if (!ctx) throw new Error("useConversations must be used inside <ConversationsProvider>");
    return ctx;
}
