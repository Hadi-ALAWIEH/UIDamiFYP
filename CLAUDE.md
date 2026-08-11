# DamiFYP Frontend — CLAUDE.md

## Tech stack

- **React 19** + TypeScript + Vite
- React Router DOM v7
- Keycloak JS (auth)
- Leaflet + react-leaflet (maps)
- `@microsoft/signalr` (live chat + location)
- No UI library — all styles are inline JS objects

## Project structure

```
src/
  api/          — One file per backend domain (client.ts, profile.ts, donationRequests.ts, …)
  auth/         — Keycloak.ts (instance), bootstrap.ts (init)
  components/   — Shared: AppLayout.tsx, LiveLocationMap.tsx, DonationMatchToast.tsx
  context/      — UserContext.tsx, ConversationsContext.tsx, useConversations.ts
  pages/        — One file per page/route
  types/        — index.ts: ALL shared TypeScript types and enums
  utils/        — bloodTypes.ts, roles.ts
```

## API calls

### Standard JSON requests → use `apiFetch`
```ts
import { apiFetch } from "../api/client";
apiFetch<ResponseType>("/api/SomeEndpoint", { method: "POST", body: JSON.stringify(payload) });
```
`apiFetch` auto-adds `Content-Type: application/json` and `Authorization: Bearer <token>`.

### Multipart/FormData uploads → use raw `fetch`
```ts
import { keycloak } from "../auth/Keycloak";
const base = import.meta.env.VITE_API_URL ?? "https://localhost:7212";
const res = await fetch(`${base}/api/UpdateProfile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${keycloak.token}` },
    body: formData,   // NO Content-Type header — browser sets it with boundary
});
```
**Never set `Content-Type` on FormData requests.** The browser must set it so the multipart boundary is included.

## Authentication

- Keycloak instance: `import { keycloak } from "../auth/Keycloak"` (named export).
- Token: `keycloak.token` — already a string, no `.value`.
- Bootstrap in `src/auth/bootstrap.ts` — called once in `main.tsx` before React renders.

## Context hooks

### `useUser()` → current user profile
```ts
const { profile, profileLoading, isDonor, isSeeker, setProfile, refreshProfile } = useUser();
```
- `profile` is `UserProfileData | null`. Starts as sessionStorage cache or Keycloak-token partial.
- `refreshProfile()` re-fetches from `GET /api/GetUserProfile` and updates both context + sessionStorage.
- `isDonor` = `role === Donor || role === DonorAndSeeker`
- `isSeeker` = `role === Seeker || role === DonorAndSeeker`

### `useConversations()` → SignalR + conversation list
```ts
const { conversations, conversationsLoading, unreadCount, connStatus, connRef, liveLocations } = useConversations();
```
- Single app-wide SignalR connection (lives in `ConversationsContext`, not torn down when leaving `/conversations`).
- `liveLocations` — map of `conversationId → LocationUpdate` for the **other** participant's GPS (never your own).
- `connRef.current` — the `HubConnection` object for sending messages.

## Route gating

```
/onboarding         — public (no gate)
/verify-identity    — public (no gate)
All other routes    — behind RequireCompletedProfile (checks sessionStorage "profileCompleted" === "true")
```

Role guards `RequireSeeker` and `RequireDonor` wrap individual routes. Always nest inside `RequireCompletedProfile`.

## AppLayout

Every authenticated page wraps its content:
```tsx
import AppLayout, { page } from "../components/AppLayout.tsx";
export default function MyPage() {
    return <AppLayout><div>...</div></AppLayout>;
}
```
`page` exports shared style constants: `page.title`, `page.card`, `page.primaryBtn`, `page.input`, `page.label`, `page.formRow`, `page.statusChip(bg, color)`, `page.bloodCircle`, etc.

## Business roles (keep in sync with backend enum)

```ts
enum BusinessRole {
    None           = 0,
    Admin          = 1,
    Donor          = 2,
    Seeker         = 3,
    DonorAndSeeker = 4,
    ManageAccount  = 5,
}
```

## Types

All types live in `src/types/index.ts`. Never define API response shapes elsewhere.

Key interfaces:
- `UserProfileData` — GET /api/GetUserProfile response + profile in context
- `ConversationViewModel` — single conversation (from `GET /api/conversation/get-all-conversations`)
- `DonationPostCandidateViewModel` — matching donor candidate
- `DonationRequestViewModel` — a seeker's request
- `MessageViewModel` — a chat message
- `LocationUpdate` — SignalR live location push
- `ConversationStartedNotification` — SignalR match notification

## Profile pictures

Backend stores a relative path (`/profile-pictures/filename.jpg`). Always prepend `VITE_API_URL`:

```ts
const apiBase = import.meta.env.VITE_API_URL ?? "https://localhost:7212";
const fullUrl = profile.profilePictureUrl ? `${apiBase}${profile.profilePictureUrl}` : null;
```

Fields carrying profile picture URLs:
- `UserProfileData.profilePictureUrl` — current user's own picture
- `ConversationViewModel.otherUserProfilePictureUrl` — the other participant's picture
- `DonationPostCandidateViewModel.donorProfilePictureUrl` — candidate donor's picture

## Maps

- Provider: Leaflet + react-leaflet. Import `"leaflet/dist/leaflet.css"` in every file that uses it.
- Leaflet icon fix (Vite breaks default icon paths) — apply once at module level:
  ```ts
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
  ```
- Geocoding: Nominatim (`https://nominatim.openstreetmap.org/search`)
- Routing: OSRM (`https://router.project-osrm.org/route/v1/driving/`)
- `LiveLocationMap` component accepts `myLat/myLng` (own GPS via `watchPosition`) and `theirLat/theirLng` (other participant's GPS from SignalR `liveLocations`). These are always separate sources.

## SignalR live location

- Hub at `https://localhost:7212/hubs/chat`, `skipNegotiation: true`, `HttpTransportType.WebSockets`.
- `ShareLocation` is sent to `OthersInGroup` — **you never receive your own updates back**.
- Your own position always comes from the browser's `navigator.geolocation.watchPosition`.
- SignalR only delivers the other person's position, stored in `ConversationsContext.liveLocations`.

## SessionStorage keys

| Key | Value |
|-----|-------|
| `"dami_user_profile"` | JSON-serialised `UserProfileData` |
| `"profileCompleted"` | `"true"` when onboarding + verification are done |

## Key pages

| Route | Page | Who can see |
|-------|------|-------------|
| `/dashboard` | Dashboard.tsx | All authenticated |
| `/requests` | MyRequests.tsx | Seeker |
| `/posts` | MyPosts.tsx | Donor |
| `/candidates` | Candidates.tsx | Seeker |
| `/available-requests` | AvailableRequests.tsx | Donor |
| `/conversations` | Conversations.tsx | All authenticated |
| `/predict` | BloodAvailability.tsx | Seeker |
| `/ask-bot` | AskBot.tsx | All authenticated |
| `/account` | AccountSettings.tsx | All authenticated |
| `/onboarding` | Onboarding.tsx | Pre-onboarding |
| `/verify-identity` | VerifyIdentity.tsx | Pre-onboarding |

## Styling conventions

- All styles are inline JS objects in a `const s = { ... }` or `const st = { ... }` at the bottom of the file.
- Color palette: `#c62828` (primary red), `#991b1b` (dark red), `#fee2e2` (light red), `#1e293b` (text), `#64748b` (muted text), `#e2e8f0` (borders).
- Sidebar is `240px` wide (`SIDEBAR_W` in AppLayout). Main content gets remaining width.
- Border-radius: cards = 12–14px, buttons = 8–9px, pills = 99px.
