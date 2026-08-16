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
    DonationPostMatchNotification,
    LocationUpdate,
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

// Unread state used to live purely client-side, in a sessionStorage "last
// seen" map. That never actually got written to in practice (nothing called
// markConversationSeen with a real conversation id), and even if it had,
// sessionStorage-only state can't answer "has this been read" correctly
// after a logout/login — there's nothing wrong with that log-in that a
// client-only flag could fix, since the true answer lives server-side.
// The backend now tracks this for real (Message.IsRead, flipped when a
// conversation is opened — see GetConversationMessagesQuery) and returns an
// authoritative `isUnread` per conversation from GetAllConversations. This
// provider just mirrors that value and keeps it live via SignalR.

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
    const [latestMessage, setLatestMessage]                 = useState<MessageViewModel | null>(null);
    const [pendingMatchNotification, setPendingMatchNotification] =
        useState<DonationPostMatchNotification | null>(null);
    const clearMatchNotification = useCallback(() => setPendingMatchNotification(null), []);

    const [liveLocations, setLiveLocations] =
        useState<Record<number, LocationUpdate | 'ended'>>({});

    const connRef     = useRef<HubConnection | null>(null);
    const activeIdRef = useRef<number | null>(null);

    // Optimistically flips a conversation to read in local state. The server
    // is the source of truth (see the "ConversationRead" handler below, which
    // does the same thing in response to the backend actually persisting it),
    // this just avoids a flash of "unread" for the connection that triggered
    // the read in the first place.
    const markConversationSeen = useCallback((conversationId: number, _at?: string) => {
        setConversations(prev =>
            prev.map(c => c.conversationId === conversationId ? { ...c, isUnread: false } : c)
        );
    }, []);

    const reload = useCallback(() => {
        setConversationsLoading(true);
        getAllConversations()
            .then(d => setConversations(d.conversations ?? []))
            .catch(() => {})
            .finally(() => setConversationsLoading(false));
    }, []);

    // Subscribes to every one of the user's conversation groups on the hub so
    // this connection actually receives ReceiveMessage pushes for all of them —
    // DamiHub only broadcasts to clients that joined that specific conversation's
    // group, it does not just push to "your" messages. Without this, the badge
    // (and latestMessage) can never update, no matter how correct the rest of
    // the counting logic is.
    //
    // Deliberately calls SubscribeToConversation, NOT JoinConversation — this
    // runs for every conversation the moment the app connects, and JoinConversation
    // marks messages read as a side effect (that's what makes the badge correct
    // after logout/login in the first place). If this used JoinConversation, just
    // having the app open would silently mark everything read on every boot.
    const joinAllConversations = useCallback(async (conn: HubConnection) => {
        try {
            const { conversations: convs } = await getAllConversations();
            await Promise.allSettled(
                convs.map(c =>
                    conn.invoke("SubscribeToConversation", c.conversationId).catch(err => {
                        console.error(`Failed to subscribe to conversation ${c.conversationId}`, err);
                        throw err;
                    })
                )
            );
        } catch (err) {
            console.error("Failed to subscribe to conversations after connecting", err);
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
                              // A message that just arrived from someone else is
                              // unread by definition; an echo of a message I sent
                              // myself obviously isn't. This is only the optimistic,
                              // instant-feedback layer — GetAllConversations (on
                              // reload/login) and "ConversationRead" below are what
                              // make the count correct, since this alone wouldn't
                              // survive a refresh.
                              isUnread: profile ? msg.senderUserId !== profile.userId : c.isUnread,
                          }
                        : c
                )
            );

            // If the user currently has this exact conversation open, DamiHub
            // already marked it read server-side as part of JoinConversation —
            // this just keeps this connection's own copy in sync instantly.
            if (msg.conversationId === activeIdRef.current) {
                markConversationSeen(msg.conversationId);
            }
        });

        // The backend marks a conversation's messages read when the user opens
        // it (JoinConversation), but that happens on whichever connection opened
        // it — usually the Conversations page's own connection, not this one.
        // This event is how that update reaches this connection's copy of the
        // list, so the sidebar badge drops immediately instead of waiting for
        // the next full reload.
        conn.on("ConversationRead", ({ conversationId }: { conversationId: number }) => {
            markConversationSeen(conversationId);
        });

        conn.on("DonationPostMatch", (n: DonationPostMatchNotification) => {
            setPendingMatchNotification(n);
        });

        conn.on("LocationUpdate", (update: LocationUpdate) => {
            setLiveLocations(prev => ({ ...prev, [update.conversationId]: update }));
        });

        conn.on("LocationStopped", ({ conversationId }: { conversationId: number }) => {
            setLiveLocations(prev => ({ ...prev, [conversationId]: 'ended' }));
        });

        conn.on("RequestCancelled", ({ seekerName, bloodType }: { seekerName: string; bloodType: string }) => {
            alert(`Your matched blood donation request has been cancelled.\n\nSeeker: ${seekerName}\nBlood type: ${bloodType}\n\nYour donation post is now available to others again.`);
        });

        conn.on("ConversationStarted", (n: ConversationStartedNotification) => {
            reload();
            // Subscribe immediately so a message sent right after the match is
            // confirmed still shows up as unread — no need to wait for a
            // reconnect cycle to pick up this brand-new conversation.
            conn.invoke("SubscribeToConversation", n.conversationId).catch(err =>
                console.error(`Failed to subscribe to new conversation ${n.conversationId}`, err)
            );
        });

        conn.onreconnecting(() => setConnStatus("connecting"));
        conn.onreconnected(() => {
            setConnStatus("connected");
            void joinAllConversations(conn);
        });
        conn.onclose(() => setConnStatus("disconnected"));

        conn.start()
            .then(() => {
                setConnStatus("connected");
                return joinAllConversations(conn);
            })
            .catch(err => {
                console.error("Connection failed to start", err);
                setConnStatus("disconnected");
            });

        connRef.current = conn;

        return () => {
            conn.stop();
            connRef.current = null;
        };
    }, [profile?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Source of truth is the server-computed conv.isUnread (see
    // GetAllConversationsRequest), kept current in between reloads by the
    // ReceiveMessage/ConversationRead handlers above.
    const isUnread = useCallback((conv: ConversationViewModel): boolean => !!conv.isUnread, []);

    const unreadCount = conversations.filter(isUnread).length;

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
            pendingMatchNotification,
            clearMatchNotification,
            liveLocations,
        }}>
            {children}
        </ConversationsContext.Provider>
    );
}

// Deliberately NOT re-exporting useConversations() here — this file must
// export ONLY the ConversationsProvider component for Vite Fast Refresh to
// hot-swap it cleanly. Import the hook directly from useConversations.ts.
