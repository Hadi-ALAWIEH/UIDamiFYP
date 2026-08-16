// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// Keep these in sync with the backend DamiFYP.Domain enums.
// ─────────────────────────────────────────────────────────────────────────────

// TODO: BACKEND – BusinessRole enum (DamiFYP.Domain/Enums/BusinessRole.cs)
export enum BusinessRole {
    None           = 0,
    Admin          = 1,
    Donor          = 2,
    Seeker         = 3,
    DonorAndSeeker = 4,
    ManageAccount  = 5,
}

// TODO: BACKEND – BloodTypeName enum (DamiFYP.Domain/Enums/BloodTypeName.cs)
export enum BloodTypeName {
    APositive  = 0,
    ANegative  = 1,
    BPositive  = 2,
    BNegative  = 3,
    OPositive  = 4,
    ONegative  = 5,
    AbPositive = 6,
    AbNegative = 7,
}

// TODO: BACKEND – DonationRequestStatus enum
export enum DonationRequestStatus {
    Pending   = 0,
    Matched   = 1,
    Completed = 2,
    Cancelled = 3,
}

// TODO: BACKEND – DonationRequestUrgency enum
export enum DonationRequestUrgency {
    Low    = 0,
    Medium = 1,
    High   = 2,
}

// TODO: BACKEND – VerificationStatus enum (DamiFYP.Domain/Models/VerificationStatus.cs)
export enum VerificationStatus {
    NotStarted = 0,
    Pending    = 1,
    Verified   = 2,
    Failed     = 3,
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE SHAPES
// These must match the ViewModel classes returned by the backend.
// ─────────────────────────────────────────────────────────────────────────────

// Returned by POST /api/CompleteOnboarding (CompleteUserOnboardingViewModel)
export enum BadgeTier {
    Newcomer    = 0,
    Helper      = 1,
    Contributor = 2,
    Guardian    = 3,
    Hero        = 4,
}

export enum DonationPostStatus {
    Active    = 0,
    Completed = 1,
}

// Badge label + emoji for display
export const BADGE_META: Record<BadgeTier, { label: string; emoji: string; color: string; bg: string }> = {
    [BadgeTier.Newcomer]:    { label: "Newcomer",    emoji: "🩸", color: "#64748b", bg: "#f1f5f9" },
    [BadgeTier.Helper]:      { label: "Helper",      emoji: "🥉", color: "#92400e", bg: "#fef3c7" },
    [BadgeTier.Contributor]: { label: "Contributor", emoji: "🥈", color: "#475569", bg: "#e2e8f0" },
    [BadgeTier.Guardian]:    { label: "Guardian",    emoji: "🥇", color: "#b45309", bg: "#fef9c3" },
    [BadgeTier.Hero]:        { label: "Hero",        emoji: "💎", color: "#6d28d9", bg: "#ede9fe" },
};

export interface UserProfileData {
    userId:        number;
    name:          string;
    email:         string;
    businessRole:  BusinessRole;
    latitude?:     number;
    longitude?:    number;
    isAvailable:   boolean;
    // Fields only present in GET /api/GetUserProfile (not in CompleteOnboarding response)
    bloodTypeName?: string | null;  // enum name string e.g. "APositive", null if not set
    createdAt?:     string;         // ISO 8601
    // Only present on GET /api/GetUserProfile - CompleteOnboarding's response
    // predates the verification step and doesn't carry it.
    verificationStatus?: VerificationStatus;
    profilePictureUrl?: string | null;
    badgeTier?:        BadgeTier;
    donationPoints?:   number;
}

// Returned by GET /api/verification/status (VerificationStatusViewModel)
export interface VerificationStatusResponse {
    status:       VerificationStatus;
    attemptCount: number;
}

// Returned by POST /api/verification/submit (SubmitVerificationViewModel)
export interface SubmitVerificationResponse {
    status:        VerificationStatus;
    failureReason: string | null;
    attemptCount:  number;
}

// Returned by GET /api/donationrequest endpoints (DonationRequestViewModel)
// NOTE: bloodTypeName is serialized as a string by the backend ("APositive", "OPositive", etc.)
export interface DonationRequestViewModel {
    id:            number;
    damiUserId:    number;
    bloodTypeName: string | null;   // enum name string from backend, e.g. "APositive"
    quantity?:     number;
    latitude?:     number;
    longitude?:    number;
    address?:      string;
    urgency:       DonationRequestUrgency;
    status:        DonationRequestStatus;
    createdAt:     string;          // ISO 8601
    neededByDate?: string;          // ISO 8601
}

// A matching donor candidate (inside DonationRequestMatchCandidatesViewModel)
// Also reused as the response shape for GET /api/donationpost/get-current-user-donation-posts
// NOTE: When returned for "my posts", only bloodTypeName and quantity are populated.
export interface DonationPostCandidateViewModel {
    donationPostId: number;
    donorUserId:    number;
    donorName:      string;
    donorAddress:   string;
    latitude?:      number;
    longitude?:     number;
    bloodTypeName:  string | null;  // enum name string from backend
    quantity?:      number;
    // True when this donor has already been confirmed as a match for the
    // request this candidate list was fetched for — persisted server-side,
    // so it survives page reloads (unlike a purely local "just confirmed" flag).
    isMatched?:             boolean;
    donorProfilePictureUrl?: string | null;
    donorBadgeTier?:        BadgeTier;
    status?:                DonationPostStatus;
}

// Returned by POST /api/donationrequest and GET /api/donationpost/get-candidates-{id}
export interface DonationRequestMatchCandidatesViewModel {
    donationRequest: DonationRequestViewModel;
    candidates:      DonationPostCandidateViewModel[];
}

// Returned by GET /api/bloodtype/GetAllBloodTypes
export interface BloodTypeViewModel {
    id:          number;
    description: string; // enum name string, e.g. "APositive"
}

// Single conversation (inside AllConversationsViewModel)
// TODO: BACKEND – Align with ConversationViewModel if the backend shape changes
export interface ConversationViewModel {
    conversationId:               number;
    matchId:                      number;
    donationRequestId:            number;
    donationPostId:               number;
    matchStatus?:                 string;
    matchCreatedAt:               string;
    donationRequestBloodTypeName: string;
    donationRequestQuantity?:     number;
    donationRequestLatitude?:     number;
    donationRequestLongitude?:    number;
    donationPostBloodTypeName:    string;
    donationPostQuantity?:        number;
    donationPostLatitude?:        number;
    donationPostLongitude?:       number;
    donorUserId:                  number;
    otherUserId:                  number;
    otherUserName:                string;
    otherUserEmail:               string;
    otherUserRole:                BusinessRole;
    otherUserProfilePictureUrl?:  string | null;
    otherUserBadgeTier?:          BadgeTier;
    latestMessageContent?:        string;
    latestMessageSentAt?:         string;
    latestMessageSenderUserId?:   number;
    latestMessageSenderName?:     string;
    // Server-computed (Message.IsRead) - see GetAllConversationsRequestHandler.
    // Was already read/written by ConversationsContext.tsx before this field
    // existed here; this just makes the type match what the backend actually
    // returns.
    isUnread:                     boolean;
}

// Returned by GET /api/conversation/get-all-conversations
export interface AllConversationsViewModel {
    conversations: ConversationViewModel[];
}

// A single chat message — returned by JoinConversation (SignalR), ReceiveMessage callback,
// and GET /api/conversation/{id}/messages
export interface MessageViewModel {
    messageId:      number;
    conversationId: number;
    senderUserId:   number;
    senderName:     string;
    content:        string;
    sentAt:         string;  // ISO 8601 UTC
    isRead:         boolean;
}

// Pushed over SignalR ("LocationUpdate") to the conversation group by ShareLocation().
// The seeker receives this to update the live-tracking map; the donor never
// receives it back (OthersInGroup excludes the sender).
export interface LocationUpdate {
    conversationId: number;
    latitude:       number;
    longitude:      number;
    senderUserId:   number;
}

// Pushed to the seeker's personal SignalR group ("user-{id}") when a donor
// creates a post that satisfies one of their pending requests.
export interface DonationPostMatchNotification {
    donationPostId:    number;
    donationRequestId: number;
    donorUserId:       number;
    donorName:         string;
    bloodTypeName?:    string;
    quantity?:         number;
    donorAddress?:     string;
    donorLatitude?:    number;
    donorLongitude?:   number;
}

// Pushed to user's personal SignalR group ("user-{id}") when a match is confirmed
export interface ConversationStartedNotification {
    conversationId: number;
    matchId:        number;
    otherUserId:    number;
    otherUserName:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSISTANT ("Ask our bot") — independent feature, not part of the
// Match/Conversation data model. See DamiFYP.Application.Features.BotAssistant.
// ─────────────────────────────────────────────────────────────────────────────

// Returned by GET/POST /api/BotAssistant/messages (BotMessageViewModel)
// NOTE: role is serialized as a string by the backend ("User" or "Assistant")
export interface BotMessageViewModel {
    role:    string;
    content: string;
    sentAt:  string; // ISO 8601 UTC
}
