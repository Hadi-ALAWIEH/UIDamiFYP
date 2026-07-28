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
// same context (via useConversations, in ./useConversations.ts) instead of
// opening its own connection, so there is only ever one SignalR connection
// per session.
//
// NOTE: this file exports ONLY the ConversationsProvider component — the
// context object + useConversations hook live in ./useConversations.ts.
// Keep it that way; a file mixing a component export with a hook export
// breaks Vite's Fast Refresh (see that file's top comment for details).
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
            // eslint-disable-next-line no-console
            console.log("[Conversations] ReceiveMessage", {
                conversationId: msg.conversationId,
                senderUserId:   msg.senderUserId,
                sentAt:         msg.sentAt,
                activeId:       activeIdRef.current,
            });

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
            // Join the new conversation's group immediately so messages sent
            // in it push live right away, without waiting for the user to
            // open it first.
            conn.invoke("JoinConversation", n.conversationId).catch(() => {});
        });

        // The server only pushes ReceiveMessage for conversations this
        // specific connection has joined (via JoinConversation) — it is NOT
        // enough to just be logged in. So on every (re)connect we join every
        // conversation the user is part of, not just whichever one happens
        // to be open in the UI. Without this, the badge only updates for
        // conversations that were manually opened during THIS connection's
        // lifetime, which is why it can look like it "stops working" after
        // a reconnect (group memberships don't survive a reconnect) or when
        // a message arrives for a conversation that was never opened yet.
        async function joinAllConversations() {
            try {
                const data = await getAllConversations();
                const list = data.conversations ?? [];
                setConversations(list);
                // eslint-disable-next-line no-console
                console.log(`[Conversations] Joining ${list.length} conversation group(s)…`, list.map(c => c.conversationId));
                const results = await Promise.allSettled(
                    list.map(c => conn.invoke("JoinConversation", c.conversationId))
                );
                results.forEach((r, i) => {
                    if (r.status === "rejected") {
                        // eslint-disable-next-line no-console
                        console.error(`[Conversations] Failed to join conversation ${list[i].conversationId}:`, r.reason);
                    }
                });
                // eslint-disable-next-line no-console
                console.log(`[Conversations] Join complete: ${results.filter(r => r.status === "fulfilled").length}/${list.length} succeeded.`);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error("[Conversations] joinAllConversations failed entirely:", err);
            }
        }

        conn.onreconnecting(() => setConnStatus("connecting"));
        conn.onreconnected(() => {
            setConnStatus("connected");
            joinAllConversations();
        });
        conn.onclose(() => setConnStatus("disconnected"));

        conn.start()
            .then(() => {
                setConnStatus("connected");
                return joinAllConversations();
            })
            .catch(() => setConnStatus("disconnected"))
            .finally(() => setConversationsLoading(false));

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
        // eslint-disable-next-line no-console
        console.log("[Conversations] unreadCount recomputed:", unreadCount, conversations.map(c => ({
            id:       c.conversationId,
            unread:   isUnread(c),
            latestAt: c.latestMessageSentAt,
            sender:   c.latestMessageSenderUserId,
            seenAt:   seenMap[c.conversationId],
        })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unreadCount, conversations]);

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
