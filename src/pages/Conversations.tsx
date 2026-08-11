import React, { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import AppLayout from "../components/AppLayout.tsx";
import LiveLocationMap from "../components/LiveLocationMap.tsx";
import { useConversations } from "../context/useConversations.ts";
import { useUser } from "../context/UserContext.tsx";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import type {
    ConversationViewModel,
    MessageViewModel,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
    const d   = new Date(iso);
    const now = new Date();
    const sameDay =
        d.getDate()     === now.getDate()  &&
        d.getMonth()    === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    return sameDay
        ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFull(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
        hour: "numeric", minute: "2-digit", month: "short", day: "numeric",
    });
}

function bloodLabel(name: string | null | undefined): string {
    return name ? bloodTypeNameStringToLabel(name) : "?";
}

const apiBase = import.meta.env.VITE_API_URL ?? "https://localhost:7212";

function otherAvatar(conv: ConversationViewModel, style: React.CSSProperties, imgStyle?: React.CSSProperties) {
    const url = conv.otherUserProfilePictureUrl ? `${apiBase}${conv.otherUserProfilePictureUrl}` : null;
    if (url) {
        return (
            <img
                src={url}
                alt={conv.otherUserName}
                style={{ ...style, objectFit: "cover", padding: 0, background: "transparent", ...imgStyle }}
            />
        );
    }
    return <div style={style}>{conv.otherUserName.charAt(0).toUpperCase()}</div>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Conversations() {
    // Conversation list + the single app-wide SignalR connection both live in
    // ConversationsContext (see src/context/ConversationsContext.tsx) so the
    // sidebar unread badge keeps working even when this page isn't mounted.
    const { profile, isDonor: isDonorRole } = useUser();
    const {
        conversations,
        conversationsLoading,
        connStatus,
        connRef,
        activeIdRef,
        latestMessage,
        isUnread,
        markConversationSeen,
        liveLocations,
    } = useConversations();

    // ── Active chat ───────────────────────────────────────────────────────────
    const [activeConv, setActiveConv] = useState<ConversationViewModel | null>(null);
    const [messages,   setMessages]   = useState<MessageViewModel[]>([]);
    const [joining,    setJoining]    = useState(false);
    const [chatError,  setChatError]  = useState<string | null>(null);

    // ── Input ─────────────────────────────────────────────────────────────────
    const [input,   setInput]   = useState("");
    const [sending, setSending] = useState(false);

    // ── Live location sharing ─────────────────────────────────────────────────
    // isSharing / localLivePos = this user's own sharing state (from watchPosition).
    // The other participant's position comes from liveLocations in context (via SignalR).
    const [isSharing,    setIsSharing]    = useState(false);
    const [localLivePos, setLocalLivePos] = useState<{ lat: number; lng: number } | null>(null);
    const watchIdRef = useRef<number | null>(null);

    const messagesEnd = useRef<HTMLDivElement>(null);

    // True when the current user is the donor for the active conversation.
    // Prefer the explicit donorUserId comparison (accurate per-conversation)
    // but fall back to the role check when donorUserId is 0 — which happens
    // while profile.userId is still loading from the API, or when the backend
    // hasn't yet returned the new field (cached conversations from before the
    // backend was restarted will have donorUserId = 0).
    const isDonor = !!activeConv && (
        activeConv.donorUserId > 0 && profile?.userId != null && profile.userId > 0
            ? profile.userId === activeConv.donorUserId
            : isDonorRole
    );

    // The other participant's live location comes from SignalR (via context).
    // 'ended' means they stopped sharing; key absent means never shared this session.
    const remoteEntry   = activeConv ? liveLocations[activeConv.conversationId] : undefined;
    const remoteLivePos = remoteEntry && remoteEntry !== 'ended' ? remoteEntry : null;
    const locationEnded = remoteEntry === 'ended';

    // Show the map when either participant is actively sharing.
    const showMap = isSharing || remoteLivePos !== null;

    // Stop sharing whenever the active conversation changes or the page unmounts.
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            const conv = activeConv;
            if (conv && connRef.current?.state === HubConnectionState.Connected) {
                connRef.current.invoke("StopSharingLocation", conv.conversationId).catch(() => {});
            }
            setIsSharing(false);
            setLocalLivePos(null);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConv?.conversationId]);

    // This page "owns" activeIdRef while it's mounted and a chat is open —
    // clear it on unmount so a message arriving after the user navigates away
    // doesn't get silently marked as seen.
    useEffect(() => {
        return () => { activeIdRef.current = null; };
    }, [activeIdRef]);

    // Append newly-arrived messages to the currently open chat.
    useEffect(() => {
        if (!latestMessage) return;
        if (latestMessage.conversationId !== activeConv?.conversationId) return;
        setMessages(prev =>
            prev.some(m => m.messageId === latestMessage.messageId)
                ? prev
                : [...prev, latestMessage]
        );
    }, [latestMessage, activeConv?.conversationId]);

    // Auto-scroll to the newest message whenever messages change
    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Open a conversation ───────────────────────────────────────────────────
    async function openConversation(conv: ConversationViewModel) {
        const conn = connRef.current;
        if (!conn) return;
        if (activeConv?.conversationId === conv.conversationId) return; // already open

        // NOTE: we intentionally do NOT leave the previously-active
        // conversation's group here anymore. The app stays joined to every
        // conversation's group for the whole session (see
        // ConversationsContext) so the sidebar unread badge keeps receiving
        // live messages for conversations that aren't currently open.

        setActiveConv(conv);
        setMessages([]);
        setChatError(null);
        setJoining(true);
        activeIdRef.current = conv.conversationId;

        // Opening it counts as seeing it — clears the unread badge for this
        // conversation immediately, before the history even finishes loading.
        markConversationSeen(conv.conversationId, conv.latestMessageSentAt);

        if (conn.state !== HubConnectionState.Connected) {
            setChatError("Not connected to chat. Please wait for reconnection.");
            setJoining(false);
            return;
        }

        try {
            // JoinConversation(conversationId) → joins the group + returns full message history
            const history = await conn.invoke<MessageViewModel[]>(
                "JoinConversation",
                conv.conversationId,
            );
            setMessages(history ?? []);
        } catch (err) {
            setChatError(err instanceof Error ? err.message : "Failed to load messages.");
        } finally {
            setJoining(false);
        }
    }

    // ── Send a message ────────────────────────────────────────────────────────
    async function handleSend() {
        const conn = connRef.current;
        if (!conn || !activeConv || !input.trim() || sending) return;
        if (conn.state !== HubConnectionState.Connected) {
            setChatError("Not connected. Please wait for reconnection.");
            return;
        }

        const text = input.trim();
        setInput("");
        setSending(true);
        setChatError(null);

        try {
            // SendMessage(conversationId, content) persists + broadcasts via ReceiveMessage
            await conn.invoke("SendMessage", activeConv.conversationId, text);
            // Do NOT manually add the message — it will arrive back through ReceiveMessage
        } catch (err) {
            setChatError(err instanceof Error ? err.message : "Failed to send message.");
            setInput(text); // restore on failure
        } finally {
            setSending(false);
        }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    // ── Location sharing (donor only) ─────────────────────────────────────────
    function toggleSharing() {
        const conn = connRef.current;
        if (!activeConv || !conn) return;

        if (isSharing) {
            // Stop sharing
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            conn.invoke("StopSharingLocation", activeConv.conversationId).catch(() => {});
            setIsSharing(false);
            setLocalLivePos(null);
        } else {
            // Start sharing
            if (!("geolocation" in navigator)) {
                setChatError("Geolocation is not available in this browser.");
                return;
            }
            setIsSharing(true);
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude: lat, longitude: lng } = pos.coords;
                    setLocalLivePos({ lat, lng });
                    if (conn.state === HubConnectionState.Connected) {
                        conn.invoke("ShareLocation", activeConv.conversationId, lat, lng)
                            .catch(() => {});
                    }
                },
                () => {
                    setChatError("Could not get your location. Please allow location access.");
                    setIsSharing(false);
                },
                { enableHighAccuracy: true, timeout: 15000 },
            );
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <AppLayout>
            {/*
              Negative margins cancel the AppLayout main padding (32px top/bottom, 36px sides)
              so the chat UI fills the entire content area flush to the edges.
            */}
            <div style={st.shell}>

                {/* ── Left: conversation list ── */}
                <aside style={st.leftPanel}>

                    <div style={st.panelHeader}>
                        <span style={st.panelTitle}>Conversations</span>
                        <ConnectionDot status={connStatus} />
                    </div>

                    {conversationsLoading && <p style={st.hint}>Loading…</p>}

                    {!conversationsLoading && conversations.length === 0 && (
                        <p style={st.hint}>
                            No conversations yet.
                            Confirm a donation match to start chatting.
                        </p>
                    )}

                    <div style={st.convList}>
                        {conversations.map(conv => {
                            const isActive = activeConv?.conversationId === conv.conversationId;
                            const unread   = isUnread(conv);
                            return (
                                <button
                                    key={conv.conversationId}
                                    style={{
                                        ...st.convBtn,
                                        ...(isActive ? st.convBtnActive : {}),
                                    }}
                                    onClick={() => openConversation(conv)}
                                >
                                    {otherAvatar(conv, {
                                        ...st.convAvatar,
                                        background: isActive ? "#c62828" : "#fee2e2",
                                        color:      isActive ? "#fff"    : "#991b1b",
                                    })}

                                    <div style={st.convBody}>
                                        <div style={{
                                            ...st.convName,
                                            ...(unread ? st.convNameUnread : {}),
                                        }}>
                                            {conv.otherUserName}
                                        </div>
                                        <div style={st.convPreview}>
                                            {conv.latestMessageContent ?? "No messages yet"}
                                        </div>
                                        <div style={st.convFooter}>
                                            <span style={st.bloodPill}>
                                                {bloodLabel(conv.donationRequestBloodTypeName)}
                                            </span>
                                            {conv.latestMessageSentAt && (
                                                <span style={st.convTime}>
                                                    {fmtTime(conv.latestMessageSentAt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {unread && <span style={st.unreadDot} />}
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* ── Right: chat area ── */}
                <div style={st.chatPane}>

                    {/* Empty state */}
                    {!activeConv && (
                        <div style={st.emptyState}>
                            <span style={{ fontSize: 52, opacity: 0.15 }}>💬</span>
                            <p style={{ color: "#94a3b8", fontSize: 15, margin: 0 }}>
                                Select a conversation to start chatting
                            </p>
                        </div>
                    )}

                    {activeConv && (
                        <>
                            {/* Chat header */}
                            <div style={st.chatHeader}>
                                {otherAvatar(activeConv, st.chatHeaderAvatar)}
                                <div>
                                    <div style={st.chatHeaderName}>
                                        {activeConv.otherUserName}
                                    </div>
                                    <div style={st.chatHeaderSub}>
                                        {bloodLabel(activeConv.donationRequestBloodTypeName)} request
                                        &nbsp;·&nbsp;
                                        {bloodLabel(activeConv.donationPostBloodTypeName)} post
                                        {activeConv.matchStatus && (
                                            <>&nbsp;·&nbsp;
                                                <span style={{ color: "#94a3b8" }}>
                                                    {activeConv.matchStatus}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div style={{ flex: 1 }} />
                                {/* Location sharing button — visible to both participants */}
                                <button
                                    style={{
                                        ...st.shareBtn,
                                        background: isSharing ? "#dc2626" : "#2563eb",
                                    }}
                                    onClick={toggleSharing}
                                    title={isSharing ? "Stop sharing your location" : "Share your live location"}
                                >
                                    {isSharing ? "⏹ Stop sharing" : "📍 Share location"}
                                </button>
                                <ConnectionDot status={connStatus} showLabel />
                            </div>

                            {/* Live location map — shown when either participant is sharing */}
                            {showMap && (
                                <LiveLocationMap
                                    postLat={activeConv.donationPostLatitude}
                                    postLng={activeConv.donationPostLongitude}
                                    requestLat={activeConv.donationRequestLatitude}
                                    requestLng={activeConv.donationRequestLongitude}
                                    myLat={localLivePos?.lat}
                                    myLng={localLivePos?.lng}
                                    theirLat={remoteLivePos?.latitude}
                                    theirLng={remoteLivePos?.longitude}
                                />
                            )}

                            {/* Location-ended notice — shown when other participant stopped sharing and neither is now active */}
                            {locationEnded && !isSharing && (
                                <div style={st.locationEndedBar}>
                                    📍 The other participant stopped sharing their location.
                                </div>
                            )}

                            {/* Messages */}
                            <div style={st.messageArea}>

                                {/* ── Match contract card (pinned at top of every conversation) ── */}
                                <MatchContractCard conv={activeConv} />

                                {joining && (
                                    <p style={st.centreMsg}>Loading messages…</p>
                                )}
                                {chatError && (
                                    <div style={st.chatErrBox}>{chatError}</div>
                                )}
                                {!joining && messages.length === 0 && !chatError && (
                                    <p style={st.centreMsg}>No messages yet — say hello!</p>
                                )}

                                {messages.map(msg => {
                                    // If the sender is the other person, align left; otherwise align right
                                    const isOther = msg.senderUserId === activeConv.otherUserId;
                                    return (
                                        <div
                                            key={msg.messageId}
                                            style={{
                                                ...st.msgRow,
                                                justifyContent: isOther ? "flex-start" : "flex-end",
                                            }}
                                        >
                                            {isOther && otherAvatar(activeConv, st.msgAvatarSm)}
                                            <div
                                                style={{
                                                    ...st.bubble,
                                                    ...(isOther ? st.bubbleLeft : st.bubbleRight),
                                                }}
                                            >
                                                <div style={{
                                                    fontSize:   14,
                                                    lineHeight: "1.5",
                                                    color:      isOther ? "#1e293b" : "#fff",
                                                }}>
                                                    {msg.content}
                                                </div>
                                                <div style={{
                                                    fontSize:  10,
                                                    marginTop: 4,
                                                    color: isOther
                                                        ? "#94a3b8"
                                                        : "rgba(255,255,255,0.55)",
                                                }}>
                                                    {fmtFull(msg.sentAt)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Scroll anchor — scrollIntoView targets this */}
                                <div ref={messagesEnd} />
                            </div>

                            {/* Input bar */}
                            <div style={st.inputBar}>
                                <textarea
                                    style={st.textarea}
                                    placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                                    value={input}
                                    rows={1}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={sending || connStatus !== "connected"}
                                />
                                <button
                                    style={{
                                        ...st.sendBtn,
                                        opacity:
                                            !input.trim() ||
                                            sending ||
                                            connStatus !== "connected"
                                                ? 0.45
                                                : 1,
                                    }}
                                    onClick={handleSend}
                                    disabled={!input.trim() || sending || connStatus !== "connected"}
                                >
                                    {sending ? "…" : "Send"}
                                </button>
                            </div>
                        </>
                    )}
                </div>

            </div>
        </AppLayout>
    );
}

// ── Match contract card ───────────────────────────────────────────────────────
// Shown at the top of every conversation — summarises the donation agreement.

function MatchContractCard({ conv }: { conv: ConversationViewModel }) {
    const reqBlood  = bloodLabel(conv.donationRequestBloodTypeName);
    const postBlood = bloodLabel(conv.donationPostBloodTypeName);
    const matchDate = new Date(conv.matchCreatedAt).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });

    return (
        <div style={ct.card}>
            {/* Title row */}
            <div style={ct.titleRow}>
                <span style={ct.titleIcon}>🩸</span>
                <span style={ct.title}>Donation Agreement</span>
                {conv.matchStatus && (
                    <span style={ct.statusPill}>{conv.matchStatus}</span>
                )}
                <span style={ct.matchDate}>Matched {matchDate}</span>
            </div>

            {/* Detail grid */}
            <div style={ct.grid}>
                {/* Seeker side */}
                <div style={ct.side}>
                    <div style={ct.sideLabel}>Request</div>
                    <div style={ct.bloodBadge}>{reqBlood}</div>
                    {conv.donationRequestQuantity != null && (
                        <div style={ct.detail}>
                            {conv.donationRequestQuantity} unit{conv.donationRequestQuantity !== 1 ? "s" : ""} needed
                        </div>
                    )}
                    <div style={ct.roleLabel}>Blood Seeker</div>
                </div>

                {/* Arrow */}
                <div style={ct.arrow}>↔</div>

                {/* Donor side */}
                <div style={ct.side}>
                    <div style={ct.sideLabel}>Post</div>
                    <div style={ct.bloodBadge}>{postBlood}</div>
                    {conv.donationPostQuantity != null && (
                        <div style={ct.detail}>
                            {conv.donationPostQuantity} unit{conv.donationPostQuantity !== 1 ? "s" : ""} available
                        </div>
                    )}
                    <div style={ct.roleLabel}>Blood Donor · {conv.otherUserName}</div>
                </div>
            </div>

            {/* Contact row */}
            <div style={ct.contactRow}>
                <span style={ct.contactLabel}>Contact</span>
                <span style={ct.contactValue}>{conv.otherUserName}</span>
                {conv.otherUserEmail && (
                    <>
                        <span style={ct.contactSep}>·</span>
                        <a href={`mailto:${conv.otherUserEmail}`} style={ct.emailLink}>
                            {conv.otherUserEmail}
                        </a>
                    </>
                )}
            </div>
        </div>
    );
}

// Contract card styles
const ct = {
    card: {
        background:   "#fff",
        border:       "1px solid #e2e8f0",
        borderRadius: 12,
        padding:      "14px 18px",
        marginBottom: 4,
        boxShadow:    "0 1px 3px rgba(0,0,0,0.05)",
    } as React.CSSProperties,
    titleRow: {
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        marginBottom: 12,
        flexWrap:     "wrap" as const,
    } as React.CSSProperties,
    titleIcon: {
        fontSize: 16,
    } as React.CSSProperties,
    title: {
        fontWeight: 700,
        fontSize:   13,
        color:      "#1e293b",
        flex:       1,
    } as React.CSSProperties,
    statusPill: {
        fontSize:     10,
        fontWeight:   700,
        padding:      "2px 8px",
        borderRadius: 99,
        background:   "#dbeafe",
        color:        "#1e40af",
        textTransform:"uppercase" as const,
        letterSpacing:"0.4px",
    } as React.CSSProperties,
    matchDate: {
        fontSize: 11,
        color:    "#94a3b8",
    } as React.CSSProperties,
    grid: {
        display:        "flex",
        alignItems:     "center",
        gap:            16,
        marginBottom:   12,
        padding:        "10px 0",
        borderTop:      "1px solid #f8fafc",
        borderBottom:   "1px solid #f8fafc",
    } as React.CSSProperties,
    side: {
        flex:          1,
        display:       "flex",
        flexDirection: "column" as const,
        gap:           3,
    } as React.CSSProperties,
    sideLabel: {
        fontSize:      10,
        fontWeight:    700,
        color:         "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        marginBottom:  2,
    } as React.CSSProperties,
    bloodBadge: {
        fontSize:     18,
        fontWeight:   800,
        color:        "#991b1b",
        background:   "#fee2e2",
        border:       "1.5px solid #fecaca",
        borderRadius: 8,
        padding:      "4px 14px",
        display:      "inline-block",
        width:        "fit-content",
    } as React.CSSProperties,
    detail: {
        fontSize:   12,
        color:      "#64748b",
        marginTop:  2,
    } as React.CSSProperties,
    roleLabel: {
        fontSize:  11,
        color:     "#94a3b8",
        marginTop: 2,
    } as React.CSSProperties,
    arrow: {
        fontSize:  20,
        color:     "#cbd5e1",
        flexShrink: 0,
    } as React.CSSProperties,
    contactRow: {
        display:    "flex",
        alignItems: "center",
        gap:        6,
        flexWrap:   "wrap" as const,
    } as React.CSSProperties,
    contactLabel: {
        fontSize:      10,
        fontWeight:    700,
        color:         "#94a3b8",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
    } as React.CSSProperties,
    contactValue: {
        fontSize:   13,
        fontWeight: 600,
        color:      "#1e293b",
    } as React.CSSProperties,
    contactSep: {
        color:  "#cbd5e1",
        fontSize: 12,
    } as React.CSSProperties,
    emailLink: {
        fontSize:       12,
        color:          "#c62828",
        textDecoration: "none",
    } as React.CSSProperties,
};

// ── Connection status indicator ───────────────────────────────────────────────

function ConnectionDot({
    status,
    showLabel = false,
}: {
    status:     "connecting" | "connected" | "disconnected";
    showLabel?: boolean;
}) {
    const color =
        status === "connected"  ? "#16a34a" :
        status === "connecting" ? "#d97706" : "#dc2626";
    const label =
        status === "connected"  ? "Live" :
        status === "connecting" ? "Connecting…" : "Disconnected";

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
                width:        8,
                height:       8,
                borderRadius: "50%",
                background:   color,
                flexShrink:   0,
            }} />
            {showLabel && (
                <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
            )}
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PANEL_W = 300;

const st = {
    // Full-bleed within AppLayout's main (negates 32px/36px padding)
    shell: {
        display:  "flex",
        height:   "calc(100vh - 64px)",
        margin:   "-32px -36px",
        overflow: "hidden",
        background: "#f8fafc",
    } as React.CSSProperties,

    // ── Left panel ────────────────────────────────────────────────────────────
    leftPanel: {
        width:         PANEL_W,
        minWidth:      PANEL_W,
        display:       "flex",
        flexDirection: "column" as const,
        borderRight:   "1px solid #e2e8f0",
        background:    "#fff",
        overflow:      "hidden",
    } as React.CSSProperties,

    panelHeader: {
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        padding:        "20px 16px 14px",
        borderBottom:   "1px solid #f1f5f9",
        flexShrink:     0,
    } as React.CSSProperties,

    panelTitle: {
        fontSize:   15,
        fontWeight: 700,
        color:      "#1e293b",
    } as React.CSSProperties,

    hint: {
        padding:  "14px 16px",
        fontSize: 13,
        color:    "#94a3b8",
        margin:   0,
    } as React.CSSProperties,

    convList: {
        flex:      1,
        overflowY: "auto" as const,
        padding:   "6px 0",
    } as React.CSSProperties,

    convBtn: {
        display:      "flex",
        alignItems:   "flex-start",
        gap:          10,
        width:        "100%",
        padding:      "11px 14px",
        background:   "transparent",
        border:       "none",
        borderBottom: "1px solid #f8fafc",
        cursor:       "pointer",
        fontFamily:   "inherit",
        textAlign:    "left" as const,
        position:     "relative" as const,
    } as React.CSSProperties,

    convBtnActive: {
        background: "#fef2f2",
    } as React.CSSProperties,

    convAvatar: {
        width:          38,
        height:         38,
        borderRadius:   "50%",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       15,
        flexShrink:     0,
    } as React.CSSProperties,

    convBody: {
        flex:    1,
        minWidth: 0,
    } as React.CSSProperties,

    convName: {
        fontSize:     14,
        fontWeight:   600,
        color:        "#1e293b",
        marginBottom: 2,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    } as React.CSSProperties,

    convNameUnread: {
        fontWeight: 800,
    } as React.CSSProperties,

    convPreview: {
        fontSize:     12,
        color:        "#94a3b8",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
        marginBottom: 4,
    } as React.CSSProperties,

    convFooter: {
        display:    "flex",
        alignItems: "center",
        gap:        6,
    } as React.CSSProperties,

    bloodPill: {
        fontSize:     10,
        fontWeight:   700,
        color:        "#991b1b",
        background:   "#fee2e2",
        padding:      "1px 6px",
        borderRadius: 99,
        border:       "1px solid #fecaca",
    } as React.CSSProperties,

    convTime: {
        fontSize:   10,
        color:      "#cbd5e1",
        marginLeft: "auto",
    } as React.CSSProperties,

    unreadDot: {
        position:     "absolute" as const,
        top:          14,
        right:        12,
        width:        9,
        height:       9,
        borderRadius: "50%",
        background:   "#c62828",
        flexShrink:   0,
    } as React.CSSProperties,

    // ── Right: chat pane ──────────────────────────────────────────────────────
    chatPane: {
        flex:          1,
        display:       "flex",
        flexDirection: "column" as const,
        overflow:      "hidden",
        background:    "#f8fafc",
        minWidth:      0,
    } as React.CSSProperties,

    emptyState: {
        flex:           1,
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        justifyContent: "center",
        gap:            14,
    } as React.CSSProperties,

    chatHeader: {
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        padding:      "14px 24px",
        background:   "#fff",
        borderBottom: "1px solid #e2e8f0",
        flexShrink:   0,
        boxShadow:    "0 1px 3px rgba(0,0,0,0.04)",
    } as React.CSSProperties,

    chatHeaderAvatar: {
        width:          42,
        height:         42,
        borderRadius:   "50%",
        background:     "#fee2e2",
        color:          "#991b1b",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       17,
        flexShrink:     0,
        border:         "2px solid #fecaca",
    } as React.CSSProperties,

    chatHeaderName: {
        fontSize:   15,
        fontWeight: 700,
        color:      "#1e293b",
    } as React.CSSProperties,

    chatHeaderSub: {
        fontSize:  12,
        color:     "#64748b",
        marginTop: 2,
    } as React.CSSProperties,

    messageArea: {
        flex:          1,
        overflowY:     "auto" as const,
        padding:       "20px 24px",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           8,
    } as React.CSSProperties,

    centreMsg: {
        textAlign: "center" as const,
        color:     "#94a3b8",
        fontSize:  13,
        margin:    "auto",
    } as React.CSSProperties,

    chatErrBox: {
        padding:      "10px 14px",
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        borderRadius: 8,
        color:        "#dc2626",
        fontSize:     13,
    } as React.CSSProperties,

    msgRow: {
        display:    "flex",
        alignItems: "flex-end",
        gap:        7,
    } as React.CSSProperties,

    msgAvatarSm: {
        width:          26,
        height:         26,
        borderRadius:   "50%",
        background:     "#fee2e2",
        color:          "#991b1b",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       10,
        flexShrink:     0,
    } as React.CSSProperties,

    bubble: {
        maxWidth:     "65%",
        padding:      "9px 14px",
        borderRadius: 14,
        wordBreak:    "break-word" as const,
    } as React.CSSProperties,

    bubbleLeft: {
        background:             "#fff",
        boxShadow:              "0 1px 3px rgba(0,0,0,0.07)",
        borderBottomLeftRadius:  4,
    } as React.CSSProperties,

    bubbleRight: {
        background:              "#c62828",
        borderBottomRightRadius: 4,
    } as React.CSSProperties,

    inputBar: {
        display:    "flex",
        alignItems: "flex-end",
        gap:        10,
        padding:    "12px 24px 16px",
        background: "#fff",
        borderTop:  "1px solid #e2e8f0",
        flexShrink: 0,
    } as React.CSSProperties,

    textarea: {
        flex:         1,
        padding:      "10px 14px",
        border:       "1px solid #e2e8f0",
        borderRadius: 10,
        fontSize:     14,
        fontFamily:   "inherit",
        resize:       "none" as const,
        outline:      "none",
        background:   "#f8fafc",
        color:        "#1e293b",
        lineHeight:   "1.45",
        maxHeight:    120,
        overflowY:    "auto" as const,
    } as React.CSSProperties,

    sendBtn: {
        padding:      "10px 22px",
        background:   "#c62828",
        color:        "#fff",
        border:       "none",
        borderRadius: 10,
        fontSize:     14,
        fontWeight:   700,
        cursor:       "pointer",
        fontFamily:   "inherit",
        flexShrink:   0,
        height:       42,
    } as React.CSSProperties,

    shareBtn: {
        padding:      "7px 13px",
        color:        "#fff",
        border:       "none",
        borderRadius: 8,
        fontSize:     12,
        fontWeight:   600,
        cursor:       "pointer",
        fontFamily:   "inherit",
        flexShrink:   0,
        transition:   "background 0.2s",
    } as React.CSSProperties,

    locationEndedBar: {
        flexShrink:   0,
        padding:      "8px 20px",
        background:   "#f1f5f9",
        fontSize:     12,
        color:        "#64748b",
        borderBottom: "1px solid #e2e8f0",
        fontStyle:    "italic",
    } as React.CSSProperties,
};
