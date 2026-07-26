import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
    HubConnectionBuilder,
    HubConnectionState,
    HttpTransportType,
    type HubConnection,
} from "@microsoft/signalr";
import AppLayout from "../components/AppLayout.tsx";
import { getAllConversations } from "../api/conversations";
import { keycloak } from "../auth/Keycloak.ts";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import type {
    ConversationViewModel,
    MessageViewModel,
    ConversationStartedNotification,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? "https://localhost:7212";

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Conversations() {
    // ── Conversation list ─────────────────────────────────────────────────────
    const [conversations, setConversations] = useState<ConversationViewModel[]>([]);
    const [convLoading,   setConvLoading]   = useState(true);
    const [convError,     setConvError]     = useState<string | null>(null);

    // ── Active chat ───────────────────────────────────────────────────────────
    const [activeConv, setActiveConv] = useState<ConversationViewModel | null>(null);
    const [messages,   setMessages]   = useState<MessageViewModel[]>([]);
    const [joining,    setJoining]    = useState(false);
    const [chatError,  setChatError]  = useState<string | null>(null);

    // ── Input ─────────────────────────────────────────────────────────────────
    const [input,   setInput]   = useState("");
    const [sending, setSending] = useState(false);

    // ── SignalR ───────────────────────────────────────────────────────────────
    const [connStatus, setConnStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

    const connRef     = useRef<HubConnection | null>(null);
    const activeIdRef = useRef<number | null>(null); // always reflects the latest active conv id
    const messagesEnd = useRef<HTMLDivElement>(null);

    // ── Boot: connect to hub + load conversation list ─────────────────────────
    useEffect(() => {
        // Load sidebar list from REST endpoint (does not need SignalR)
        getAllConversations()
            .then(d => setConversations(d.conversations ?? []))
            .catch(err => setConvError(err instanceof Error ? err.message : "Failed to load."))
            .finally(() => setConvLoading(false));

        // Build connection to /hubs/chat.
        // skipNegotiation + WebSockets-only bypasses the HTTP POST negotiate step,
        // which fails in dev when the browser hasn't trusted the self-signed cert
        // for cross-origin fetch requests. WebSocket upgrades are not subject to
        // the same CORS preflight restriction, so this works reliably in dev and prod.
        // The hub reads the JWT from the `access_token` query param (standard SignalR pattern).
        const conn = new HubConnectionBuilder()
            .withUrl(`${BASE_URL}/hubs/chat`, {
                accessTokenFactory: () => keycloak.token ?? "",
                skipNegotiation:    true,
                transport:          HttpTransportType.WebSockets,
            })
            .withAutomaticReconnect()
            .build();

        // Server → client: a participant sent a message in a joined conversation
        conn.on("ReceiveMessage", (msg: MessageViewModel) => {
            // Append to messages only if this belongs to the currently open conversation
            if (msg.conversationId === activeIdRef.current) {
                setMessages(prev => [...prev, msg]);
            }
            // Always update the sidebar preview
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
        });

        // Server → client: a match was confirmed and created a new conversation
        conn.on("ConversationStarted", (_n: ConversationStartedNotification) => {
            getAllConversations().then(d => setConversations(d.conversations ?? []));
        });

        conn.onreconnecting(() => setConnStatus("connecting"));
        conn.onreconnected(() => {
            setConnStatus("connected");
            // Rejoin the active conversation after reconnection
            if (activeIdRef.current !== null) {
                conn.invoke<MessageViewModel[]>("JoinConversation", activeIdRef.current)
                    .then(history => setMessages(history ?? []))
                    .catch(() => {});
            }
        });
        conn.onclose(() => setConnStatus("disconnected"));

        conn.start()
            .then(() => setConnStatus("connected"))
            .catch(() => setConnStatus("disconnected"));

        connRef.current = conn;

        return () => { conn.stop(); };
    }, []);

    // Auto-scroll to the newest message whenever messages change
    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Open a conversation ───────────────────────────────────────────────────
    async function openConversation(conv: ConversationViewModel) {
        const conn = connRef.current;
        if (!conn) return;
        if (activeConv?.conversationId === conv.conversationId) return; // already open

        // Leave the previous conversation group on the server
        if (activeIdRef.current !== null) {
            conn.invoke("LeaveConversation", activeIdRef.current).catch(() => {});
        }

        setActiveConv(conv);
        setMessages([]);
        setChatError(null);
        setJoining(true);
        activeIdRef.current = conv.conversationId;

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

                    {convLoading && <p style={st.hint}>Loading…</p>}
                    {convError   && <p style={{ ...st.hint, color: "#dc2626" }}>{convError}</p>}

                    {!convLoading && !convError && conversations.length === 0 && (
                        <p style={st.hint}>
                            No conversations yet.
                            Confirm a donation match to start chatting.
                        </p>
                    )}

                    <div style={st.convList}>
                        {conversations.map(conv => {
                            const isActive = activeConv?.conversationId === conv.conversationId;
                            return (
                                <button
                                    key={conv.conversationId}
                                    style={{
                                        ...st.convBtn,
                                        ...(isActive ? st.convBtnActive : {}),
                                    }}
                                    onClick={() => openConversation(conv)}
                                >
                                    <div style={{
                                        ...st.convAvatar,
                                        background: isActive ? "#c62828" : "#fee2e2",
                                        color:      isActive ? "#fff"    : "#991b1b",
                                    }}>
                                        {conv.otherUserName.charAt(0).toUpperCase()}
                                    </div>

                                    <div style={st.convBody}>
                                        <div style={st.convName}>{conv.otherUserName}</div>
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
                                <div style={st.chatHeaderAvatar}>
                                    {activeConv.otherUserName.charAt(0).toUpperCase()}
                                </div>
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
                                <ConnectionDot status={connStatus} showLabel />
                            </div>

                            {/* Messages */}
                            <div style={st.messageArea}>
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
                                            {isOther && (
                                                <div style={st.msgAvatarSm}>
                                                    {activeConv.otherUserName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
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
};
