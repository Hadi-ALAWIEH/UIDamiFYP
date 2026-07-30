import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    HubConnectionBuilder,
    HttpTransportType,
    type HubConnection,
} from "@microsoft/signalr";
import { getAllConversations } from "../api/conversations";
import { keycloak } from "../auth/Keycloak.ts";
import { useUser } from "./UserContext.tsx";
import { ConversationsContext } from "./useConversations.ts";
import type {
    ConversationViewModel,
    MessageViewModel,
    ConversationStartedNotification,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// This provider owns the app-wide SignalR chat connection and conversation
// list. It lives above the router (see App.tsx) so it stays connected and
// keeps receiving messages no matter which page the user is currently on —
// that's what lets the sidebar show an unread-messages badge on the
// "Conversations" nav item even before the user opens that page.
//
// The Conversations page itself (src/pages/Conversations.tsx) consumes this
// same context instead of opening its own connection, so there is only ever
// one SignalR connection per session.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? "https://localhost:7212";

// Per-conversation "last seen" timestamps, persisted so unread state
// survives page refreshes / navigation within the same browser session.
const SEEN_STORAGE_KEY = "dami_conversations_last_seen";

function loadSeenMap(): Record<number, string> {
    try {
        const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Record<number, string>) : {};
    } catch {
        return {};
    }
}

function saveSeenMap(map: Record<number, string>): void {
    try {
        sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // ignore storage failures (e.g. private browsing quota)
    }
}

// NOTE: the Context object and its value type live in useConversations.ts
// (not here), so every consumer — this provider, AppLayout, the Conversations
// page — reads from the exact same Context instance. Defining a second,
// private createContext() here previously caused consumers of the shared one
// to always see null and throw "must be used inside <ConversationsProvider>".

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
    const { profile } = useUser();

    const [conversations, setConversations]               = useState<ConversationViewModel[]>([]);
    const [conversationsLoading, setConversationsLoading]  = useState(true);
    const [connStatus, setConnStatus]                      = useState<"connecting" | "connected" | "disconnected">("connecting");
    const [seenMap, setSeenMap]                             = useState<Record<number, string>>(() => loadSeenMap());
    const [latestMessage, setLatestMessage]                 = useState<MessageViewModel | null>(null);

    const connRef     = useRef<HubConnection | null>(null);
    const activeIdRef = useRef<number | null>(null);

    const markConversationSeen = useCallback((conversationId: number, at?: string) => {
        setSeenMap(prev => {
            const next = { ...prev, [conversationId]: at ?? new Date().toISOString() };
            saveSeenMap(next);
            return next;
        });
    }, []);

    const reload = useCallback(() => {
        setConversationsLoading(true);
        getAllConversations()
            .then(d => setConversations(d.conversations ?? []))
            .catch(() => {})
            .finally(() => setConversationsLoading(false));
    }, []);

    // Joins every one of the user's conversation groups on the hub so this
    // connection actually receives ReceiveMessage pushes for all of them —
    // DamiHub only broadcasts to clients that called JoinConversation for
    // that specific conversation, it does not just push to "your" messages.
    // Without this, the badge (and latestMessage) can never update, no
    // matter how correct the rest of the counting logic is.
    const joinAllConversations = useCallback(async (conn: HubConnection) => {
        try {
            const { conversations: convs } = await getAllConversations();
            console.log(
                "[DAMI-BADGE] joining conversation groups:",
                convs.map(c => c.conversationId)
            );
            const results = await Promise.allSettled(
                convs.map(c =>
                    conn.invoke("JoinConversation", c.conversationId).catch(err => {
                        console.error(`[DAMI-BADGE] Failed to join conversation ${c.conversationId}`, err);
                        throw err;
                    })
                )
            );
            console.log(
                "[DAMI-BADGE] join results:",
                results.map(r => r.status)
            );
        } catch (err) {
            console.error("[DAMI-BADGE] Failed to join conversations after connecting", err);
        }
    }, []);

    // Boot the connection once we know who's logged in. Re-runs if the user
    // changes (e.g. logout → different account), and tears the connection
    // down on unmount / when there's no profile (logged out).
    useEffect(() => {
        if (!profile) return;

        reload();

        // See src/pages/Conversations.tsx (original implementation) for why
        // skipNegotiation + WebSockets-only is used here in dev.
        const conn = new HubConnectionBuilder()
            .withUrl(`${BASE_URL}/hubs/chat`, {
                accessTokenFactory: () => keycloak.token ?? "",
                skipNegotiation:    true,
                transport:          HttpTransportType.WebSockets,
            })
            .withAutomaticReconnect()
            .build();

        conn.on("ReceiveMessage", (msg: MessageViewModel) => {
            console.log("[DAMI-BADGE] ReceiveMessage:", msg);
            setLatestMessage(msg);

            setConversations(prev =>
                prev.map(c =>
                    c.conversationId === msg.conversationId
                        ? {
                              ...c,
                              latestMessageContent:      msg.content,
                              latestMessageSentAt:       msg.sentAt,
                              latestMessageSenderUserId: msg.senderUserId,
                              latestMessageSenderName:   msg.senderName,
                          }
                        : c
                )
            );

            // If the user currently has this exact conversation open, it's
            // seen the instant it arrives — don't let it count as unread.
            if (msg.conversationId === activeIdRef.current) {
                markConversationSeen(msg.conversationId, msg.sentAt);
            }
        });

        conn.on("ConversationStarted", (n: ConversationStartedNotification) => {
            reload();
            // Join it immediately so a message sent right after the match is
            // confirmed still shows up as unread — no need to wait for a
            // reconnect cycle to pick up this brand-new conversation.
            conn.invoke("JoinConversation", n.conversationId).catch(err =>
                console.error(`Failed to join new conversation ${n.conversationId}`, err)
            );
        });

        conn.onreconnecting(() => setConnStatus("connecting"));
        conn.onreconnected(() => {
            setConnStatus("connected");
            void joinAllConversations(conn);
        });
        conn.onclose(() => setConnStatus("disconnected"));

        console.log("[DAMI-BADGE] starting connection for user", profile.userId);
        conn.start()
            .then(() => {
                console.log("[DAMI-BADGE] connection started, state:", conn.state);
                setConnStatus("connected");
                return joinAllConversations(conn);
            })
            .catch(err => {
                console.error("[DAMI-BADGE] connection failed to start", err);
                setConnStatus("disconnected");
            });

        connRef.current = conn;

        return () => {
            conn.stop();
            connRef.current = null;
        };
    }, [profile?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

    const isUnread = useCallback((conv: ConversationViewModel): boolean => {
        // Nothing sent yet, or the last message was sent by me — nothing new.
        if (!conv.latestMessageSentAt || conv.latestMessageSenderUserId == null) return false;
        if (profile && conv.latestMessageSenderUserId === profile.userId) return false;

        const lastSeen = seenMap[conv.conversationId];
        if (!lastSeen) return true; // this conversation has never been opened

        return new Date(conv.latestMessageSentAt).getTime() > new Date(lastSeen).getTime();
    }, [seenMap, profile]);

    const unreadCount = conversations.filter(isUnread).length;

    useEffect(() => {
        console.log(
            "[DAMI-BADGE] unreadCount recomputed:", unreadCount,
            "conversations:", conversations.map(c => ({
                id: c.conversationId,
                lastSentAt: c.latestMessageSentAt,
                lastSenderId: c.latestMessageSenderUserId,
                seenAt: seenMap[c.conversationId],
            }))
        );
    }, [unreadCount, conversations, seenMap]);

    return (
        <ConversationsContext.Provider value={{
            conversations,
            conversationsLoading,
            connStatus,
            connRef,
            activeIdRef,
            latestMessage,
            unreadCount,
            isUnread,
            markConversationSeen,
            reload,
        }}>
            {children}
        </ConversationsContext.Provider>
    );
}

// Deliberately NOT re-exporting useConversations() here — this file must
// export ONLY the ConversationsProvider component for Vite Fast Refresh to
// hot-swap it cleanly. Import the hook directly from useConversations.ts.
