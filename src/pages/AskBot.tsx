import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import AppLayout from "../components/AppLayout.tsx";
import { getBotMessages, sendBotMessage } from "../api/botAssistant";
import type { BotMessageViewModel } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFull(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
        hour: "numeric", minute: "2-digit", month: "short", day: "numeric",
    });
}

function isUser(msg: BotMessageViewModel): boolean {
    return msg.role === "User";
}

// ── Component ─────────────────────────────────────────────────────────────────
// "Ask our bot" — independent of the Conversations feature. There's no SignalR
// connection here: a reply is always the direct response to the request that
// produced it, so this is plain request/response against
// GET/POST /api/BotAssistant/messages.

export default function AskBot() {
    const [messages, setMessages] = useState<BotMessageViewModel[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [input,   setInput]   = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);

    const messagesEnd = useRef<HTMLDivElement>(null);

    // ── Boot: load history ────────────────────────────────────────────────────
    useEffect(() => {
        getBotMessages()
            .then(setMessages)
            .catch(err => setLoadError(err instanceof Error ? err.message : "Failed to load messages."))
            .finally(() => setLoading(false));
    }, []);

    // ── Auto-scroll to the newest message ─────────────────────────────────────
    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

    // ── Send ───────────────────────────────────────────────────────────────────
    async function handleSend() {
        const text = input.trim();
        // Guard against sending while a reply is still being generated, and
        // against double-submits from a fast Enter + click.
        if (!text || sending) return;

        setSendError(null);
        setInput("");
        setSending(true);

        // Show the user's own message immediately — no need to wait on the
        // round trip just to see what you typed.
        const optimisticUserMessage: BotMessageViewModel = {
            role:    "User",
            content: text,
            sentAt:  new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimisticUserMessage]);

        try {
            const reply = await sendBotMessage(text);
            setMessages(prev => [...prev, reply]);
        } catch (err) {
            setSendError(err instanceof Error ? err.message : "Failed to reach the assistant.");
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
              Negative margins cancel the AppLayout main padding so the chat UI
              fills the entire content area flush to the edges, same pattern as
              the Conversations page.
            */}
            <div style={st.shell}>

                <div style={st.chatHeader}>
                    <div style={st.chatHeaderAvatar}>🤖</div>
                    <div>
                        <div style={st.chatHeaderName}>Ask our bot</div>
                        <div style={st.chatHeaderSub}>
                            Questions about the app, or blood type availability
                        </div>
                    </div>
                </div>

                <div style={st.messageArea}>
                    {loading && <p style={st.centreMsg}>Loading…</p>}
                    {loadError && <div style={st.errBox}>{loadError}</div>}

                    {!loading && !loadError && messages.length === 0 && (
                        <p style={st.centreMsg}>
                            No messages yet — ask about how Dami works, or whether a blood type
                            is currently available.
                        </p>
                    )}

                    {messages.map((msg, i) => {
                        const mine = isUser(msg);
                        return (
                            <div
                                key={i}
                                style={{
                                    ...st.msgRow,
                                    justifyContent: mine ? "flex-end" : "flex-start",
                                }}
                            >
                                {!mine && <div style={st.msgAvatarSm}>🤖</div>}
                                <div
                                    style={{
                                        ...st.bubble,
                                        ...(mine ? st.bubbleRight : st.bubbleLeft),
                                    }}
                                >
                                    <div style={{
                                        fontSize:   14,
                                        lineHeight: "1.5",
                                        color:      mine ? "#fff" : "#1e293b",
                                        whiteSpace: "pre-wrap" as const,
                                    }}>
                                        {msg.content}
                                    </div>
                                    <div style={{
                                        fontSize:  10,
                                        marginTop: 4,
                                        color: mine
                                            ? "rgba(255,255,255,0.55)"
                                            : "#94a3b8",
                                    }}>
                                        {fmtFull(msg.sentAt)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Waiting-for-reply indicator — shown while a message is in flight */}
                    {sending && (
                        <div style={{ ...st.msgRow, justifyContent: "flex-start" }}>
                            <div style={st.msgAvatarSm}>🤖</div>
                            <div style={{ ...st.bubble, ...st.bubbleLeft, ...st.typingBubble }}>
                                <span style={st.typingText}>Generating response</span>
                                <span style={st.typingDots}>
                                    <span style={{ ...st.typingDot, animationDelay: "0ms" }} />
                                    <span style={{ ...st.typingDot, animationDelay: "160ms" }} />
                                    <span style={{ ...st.typingDot, animationDelay: "320ms" }} />
                                </span>
                            </div>
                        </div>
                    )}

                    {sendError && <div style={st.errBox}>{sendError}</div>}

                    <div ref={messagesEnd} />
                </div>

                {/* Input bar — disabled entirely while waiting on a reply, so the
                    user physically cannot send a second message until the bot
                    responds (or the request fails). */}
                <div style={st.inputBar}>
                    <textarea
                        style={st.textarea}
                        placeholder={
                            sending
                                ? "Waiting for a response…"
                                : "Ask something… (Enter to send, Shift+Enter for new line)"
                        }
                        value={input}
                        rows={1}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={sending}
                    />
                    <button
                        style={{
                            ...st.sendBtn,
                            opacity: !input.trim() || sending ? 0.45 : 1,
                        }}
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
                    >
                        {sending ? "…" : "Send"}
                    </button>
                </div>

            </div>

            {/* Typing-dot animation, scoped to this page */}
            <style>{`
                @keyframes dami-bot-typing-bounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30%           { transform: translateY(-4px); opacity: 1; }
                }
            `}</style>
        </AppLayout>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Mirrors the visual language of pages/Conversations.tsx so this feels like
// part of the same app, while remaining a fully independent, single-pane page.

const st = {
    shell: {
        display:       "flex",
        flexDirection: "column" as const,
        height:        "calc(100vh - 64px)",
        margin:        "-32px -36px",
        overflow:      "hidden",
        background:    "#f8fafc",
    } as React.CSSProperties,

    chatHeader: {
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        padding:      "16px 24px",
        background:   "#fff",
        borderBottom: "1px solid #e2e8f0",
        flexShrink:   0,
    } as React.CSSProperties,

    chatHeaderAvatar: {
        width:          38,
        height:         38,
        borderRadius:   "50%",
        background:     "#fee2e2",
        color:          "#991b1b",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       18,
        flexShrink:     0,
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

    errBox: {
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
        fontSize:       12,
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

    typingBubble: {
        display:    "flex",
        alignItems: "center",
        gap:        8,
    } as React.CSSProperties,

    typingText: {
        fontSize: 13,
        color:    "#64748b",
        fontStyle:"italic",
    } as React.CSSProperties,

    typingDots: {
        display:    "flex",
        alignItems: "center",
        gap:        3,
    } as React.CSSProperties,

    typingDot: {
        width:        5,
        height:       5,
        borderRadius: "50%",
        background:   "#94a3b8",
        animation:    "dami-bot-typing-bounce 1s infinite ease-in-out",
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
