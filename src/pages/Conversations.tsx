import { useEffect, useState } from "react";
import AppLayout, { page } from "../components/AppLayout.tsx";
import { getAllConversations } from "../api/conversations";
import { bloodTypeNameStringToLabel } from "../utils/bloodTypes";
import { getRoleLabel } from "../utils/roles";
import { type ConversationViewModel, BusinessRole } from "../types";

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit",
    });
}

export default function Conversations() {
    const [convos,  setConvos]  = useState<ConversationViewModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);

    useEffect(() => {
        // GET /api/conversation/get-all-conversations
        getAllConversations()
            .then(data => setConvos(data.conversations))
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load conversations."))
            .finally(() => setLoading(false));
    }, []);

    return (
        <AppLayout>

            <header style={page.topBar}>
                <div>
                    <h2 style={page.title}>Conversations</h2>
                    <p style={page.subtitle}>
                        Chats opened after a donation match is confirmed
                    </p>
                </div>
            </header>

            {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
            {error   && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

            {!loading && !error && convos.length === 0 && (
                <div style={page.emptyBox}>
                    <span style={{ fontSize: 36, opacity: 0.3 }}>💬</span>
                    <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
                        No conversations yet.
                    </p>
                    <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                        Conversations are created automatically when a donation match is confirmed.
                    </p>
                </div>
            )}

            {!loading && convos.length > 0 && (
                <div style={s.list}>
                    {convos.map(c => (
                        <ConvoCard key={c.conversationId} convo={c} />
                    ))}
                </div>
            )}

            {/* TODO: BACKEND – Add a conversation detail / messaging view once
                  GET /api/conversation/{id}/messages and
                  POST /api/conversation/{id}/messages endpoints are available. */}

        </AppLayout>
    );
}

function ConvoCard({ convo }: { convo: ConversationViewModel }) {
    const hasLastMsg = !!convo.latestMessageContent;
    const roleLabel  = getRoleLabel(convo.otherUserRole ?? BusinessRole.None);

    return (
        <div style={s.card}>

            {/* Avatar + name */}
            <div style={s.avatar}>
                {convo.otherUserName.charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.nameRow}>
                    <span style={s.otherName}>{convo.otherUserName}</span>
                    {/* TODO: BACKEND – otherUserRole comes from ConversationViewModel */}
                    <span style={s.roleChip}>{roleLabel}</span>
                </div>

                {/* Match summary */}
                <div style={s.matchSummary}>
                    {/* TODO: BACKEND – blood type names come as strings from ConversationViewModel */}
                    Request: <strong>{bloodTypeNameStringToLabel(convo.donationRequestBloodTypeName)}</strong>
                    {convo.donationRequestQuantity != null && ` (${convo.donationRequestQuantity} unit${convo.donationRequestQuantity !== 1 ? "s" : ""})`}
                    {" "}· Post: <strong>{bloodTypeNameStringToLabel(convo.donationPostBloodTypeName)}</strong>
                    {convo.donationPostQuantity != null && ` (${convo.donationPostQuantity} unit${convo.donationPostQuantity !== 1 ? "s" : ""})`}
                </div>

                {/* Latest message */}
                {hasLastMsg ? (
                    <div style={s.lastMsg}>
                        <span style={s.msgSender}>{convo.latestMessageSenderName ?? "Unknown"}:</span>
                        {" "}{convo.latestMessageContent}
                    </div>
                ) : (
                    <div style={s.noMsg}>No messages yet — say hello!</div>
                )}
            </div>

            {/* Timestamp */}
            <div style={s.timestamp}>
                {convo.latestMessageSentAt
                    ? <>{fmtTime(convo.latestMessageSentAt)}<br />{fmtDate(convo.latestMessageSentAt)}</>
                    : fmtDate(convo.matchCreatedAt)
                }
            </div>

        </div>
    );
}

const s = {
    list: {
        display:       "flex",
        flexDirection: "column" as const,
        gap:           10,
    },
    card: {
        background:   "#fff",
        borderRadius: 12,
        padding:      "16px 18px",
        display:      "flex",
        alignItems:   "center",
        gap:          14,
        boxShadow:    "0 1px 4px rgba(0,0,0,0.06)",
        cursor:       "default",
        // TODO: wrap in a <Link> or add onClick when conversation detail page exists
    },
    avatar: {
        width:          44,
        height:         44,
        borderRadius:   "50%",
        background:     "#fee2e2",
        color:          "#991b1b",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     700,
        fontSize:       18,
        flexShrink:     0,
        border:         "2px solid #fecaca",
    },
    nameRow: {
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        marginBottom: 3,
    },
    otherName: {
        fontWeight: 600,
        fontSize:   14,
        color:      "#1e293b",
    },
    roleChip: {
        fontSize:     10,
        fontWeight:   600,
        padding:      "2px 7px",
        borderRadius: 99,
        background:   "#fee2e2",
        color:        "#991b1b",
    },
    matchSummary: {
        fontSize:     12,
        color:        "#64748b",
        marginBottom: 4,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    },
    lastMsg: {
        fontSize:     13,
        color:        "#374151",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
    },
    msgSender: {
        fontWeight: 600,
        color:      "#1e293b",
    },
    noMsg: {
        fontSize:    13,
        color:       "#94a3b8",
        fontStyle:   "italic" as const,
    },
    timestamp: {
        fontSize:   11,
        color:      "#94a3b8",
        textAlign:  "right" as const,
        flexShrink: 0,
        lineHeight: "1.5",
    },
};
