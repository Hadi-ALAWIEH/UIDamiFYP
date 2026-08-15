# DamiFYP — Manual Testing Checklist

Use this list to verify every feature before your final year project demonstration.
Check each box as you confirm the behaviour is correct.

---

## Authentication & Onboarding

- [ ] Unauthenticated user is redirected to Keycloak login
- [ ] After login, a new user is redirected to `/onboarding` (not dashboard)
- [ ] Onboarding form accepts name, role (Donor / Seeker / Both), and location
- [ ] Submitting onboarding with no name or no role is rejected with an error
- [ ] After onboarding, user is taken to face verification
- [ ] An already-verified user skips straight to the dashboard on next login

---

## Identity Verification

- [ ] Face verification page shows a pose challenge sequence
- [ ] Completing the poses successfully sets status to Verified and unlocks the app
- [ ] A failed verification shows the failure reason and allows retry

---

## Dashboard

- [ ] Donor sees their total donation posts count
- [ ] Seeker sees their total requests and how many are Pending
- [ ] All users see a Conversations card showing the real unread count (not hardcoded 0)
- [ ] The unread badge on the Conversations card updates when new messages arrive

---

## Profile Pictures & Account Settings (`/account`)

- [ ] Account Settings is accessible from the sidebar for all users
- [ ] Current profile picture is shown (or a letter avatar if none is set)
- [ ] Clicking the avatar or "Choose Photo" opens a file picker
- [ ] Selecting an image shows a live preview before saving
- [ ] Saving uploads the image and the sidebar avatar updates immediately
- [ ] Name can be edited and saved
- [ ] Role can be changed (e.g. Seeker → Donor & Seeker) and the sidebar nav updates to reflect the new role
- [ ] Availability toggle can be switched on/off and saved
- [ ] Profile picture persists across page refreshes and re-logins

---

## Sidebar & Navigation

- [ ] Donor-only pages (My Posts, Available Requests) are hidden from Seekers
- [ ] Seeker-only pages (My Requests, Find Donors, Blood Availability) are hidden from Donors
- [ ] A user with role Donor & Seeker sees all nav items
- [ ] Conversations badge shows the unread count and clears when messages are read
- [ ] Account Settings item is always visible regardless of role

---

## Donor — Donation Posts (`/posts`)

- [ ] Donor can create a donation post (blood type, quantity, address, location picked on map)
- [ ] Created post appears in the My Posts list immediately
- [ ] Each post card shows a small inline map with the donation location
- [ ] "Open in Google Maps" link opens the correct coordinates in a new tab
- [ ] Post can be deleted

---

## Donor — Available Requests (`/available-requests`)

- [ ] Donor sees all pending seeker donation requests
- [ ] Each request shows blood type, quantity, urgency, and location

---

## Seeker — Donation Requests (`/requests`)

- [ ] Seeker can create a new donation request (blood type, quantity, urgency, address, needed-by date)
- [ ] After creating a request, matching donor candidates appear inline immediately
- [ ] Candidate card shows donor name, avatar / profile picture, blood type badge, quantity badge, address, and mini-map
- [ ] "View on Google Maps" link on a candidate card opens the correct location
- [ ] "Confirm Match" button triggers the match flow
- [ ] After confirming, the button changes to "Matched" and is disabled for that donor
- [ ] Confirming the same match twice is a no-op (no duplicate conversation is created)
- [ ] Request list shows each request's current status (Pending / Matched / Completed)
- [ ] A request can be deleted

---

## Seeker — Find Donors (`/candidates`)

- [ ] Seeker can browse all compatible donor candidates independently of a specific request

---

## Matching & Notifications

- [ ] When a Seeker confirms a match, both users receive a "You've been matched" email
- [ ] Both Seeker and Donor see a real-time "Conversation started" toast notification via SignalR if both are online
- [ ] When a Donor creates a post that matches a Seeker's pending request, the Seeker receives a real-time match notification toast

---

## Conversations (`/conversations`)

- [ ] Matched users can see each other's conversation in the left sidebar
- [ ] Sidebar entry shows the other user's profile picture (or initial), name, blood type, and latest message preview
- [ ] Opening a conversation loads the full message history
- [ ] Sending a message delivers it in real time to the other participant without a page refresh
- [ ] Received messages are marked as read when the conversation is opened
- [ ] Unread conversations show a red dot in the sidebar list
- [ ] Chat header shows the other user's profile picture and name
- [ ] The other user's avatar appears next to their messages in the chat

---

## Live Location Sharing (inside a Conversation)

- [ ] "Share My Location" button starts broadcasting the user's GPS position
- [ ] The map appears and shows the user's own position as a **blue** pulsing dot
- [ ] The other participant's live position appears as an **orange** pulsing dot when they also share
- [ ] The map auto-fits to show the donation post location, request location, and both live dots
- [ ] Status text updates correctly: "You are sharing" / "Both sharing live location" / "Waiting for other participant"
- [ ] Stopping location sharing hides the sender's dot; the other person's dot remains if they are still sharing

---

## Blood Availability Prediction (`/predict`) — Seeker only

- [ ] Seeker can submit a blood type and region to get a prediction
- [ ] Result displays an availability likelihood with a confidence score

---

## AI Bot Assistant (`/ask-bot`)

- [ ] All authenticated users can open the bot page
- [ ] Sending a message receives a relevant response from the Gemini-powered assistant
- [ ] Conversation history persists across page refreshes
- [ ] Sending too many messages in quick succession triggers a rate-limit error (429)

---

## Profile Pictures — Cross-cutting Checks

- [ ] A profile picture uploaded on Account Settings is visible to other users in candidate cards
- [ ] The other user's profile picture appears in the conversation sidebar and chat header
- [ ] A user with no profile picture consistently shows their name initial as a fallback everywhere

---

## Suggested Demo Order

1. Login as a new user → complete onboarding → pass face verification
2. Go to Account Settings → upload a profile picture → confirm sidebar updates
3. As a **Seeker**: create a donation request → view inline candidates with avatars and maps → confirm a match
4. Observe the real-time match notification toast on the Donor's screen
5. Open the Conversation → send messages back and forth in real time
6. Enable live location sharing on both devices → observe the blue and orange dots on the map
7. Visit `/ask-bot` → ask the assistant a blood-donation question
8. Visit `/predict` → request a blood availability prediction
