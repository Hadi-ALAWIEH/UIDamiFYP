import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { UserProvider, useUser } from "./context/UserContext.tsx";
import { ConversationsProvider } from "./context/ConversationsContext.tsx";
import DonationMatchToast from "./components/DonationMatchToast.tsx";
import Onboarding       from "./pages/Onboarding.tsx";
import VerifyIdentity     from "./pages/VerifyIdentity.tsx";
import Dashboard        from "./pages/Dashboard.tsx";
import MyRequests       from "./pages/MyRequests.tsx";
import MyPosts          from "./pages/MyPosts.tsx";
import AvailableRequests from "./pages/AvailableRequests.tsx";
import Conversations      from "./pages/Conversations.tsx";
import AskBot             from "./pages/AskBot.tsx";
import BloodAvailability  from "./pages/BloodAvailability.tsx";
import Candidates         from "./pages/Candidates.tsx";
import AccountSettings    from "./pages/AccountSettings.tsx";
import type {JSX} from "react";

// ── Onboarding/verification gate ────────────────────────────────────────────
//
// profileCompleted now means "base profile saved AND identity verification
// passed" (see CheckProfileExistenceQueryHandler / Onboarding.tsx). Previously
// only the "/" redirect below checked this flag - every other route
// (/dashboard, /requests, ...) had no gating at all, so a user could type
// /dashboard directly and skip onboarding/verification entirely. This layout
// route closes that gap: every route nested under it requires the flag,
// bouncing back to /onboarding otherwise. /onboarding and /verify-identity
// themselves stay outside it, since they're the only way TO become completed.
function RequireCompletedProfile() {
    const profileCompleted =
        sessionStorage.getItem("profileCompleted") === "true";
    return profileCompleted ? <Outlet /> : <Navigate to="/onboarding" replace />;
}

// ── Role-based route guards ────────────────────────────────────────────────

function RequireSeeker({ children }: { children: JSX.Element }) {
    const { isSeeker } = useUser();
    // TODO: BACKEND – If the user's role isn't loaded yet (profile is null),
    //   show a loading spinner instead of redirecting.
    return isSeeker ? children : <Navigate to="/dashboard" replace />;
}

function RequireDonor({ children }: { children: JSX.Element }) {
    const { isDonor } = useUser();
    return isDonor ? children : <Navigate to="/dashboard" replace />;
}

// ── Router ─────────────────────────────────────────────────────────────────

function AppRoutes() {
    const profileCompleted =
        sessionStorage.getItem("profileCompleted") === "true";

    return (
        <Routes>

            {/* Default redirect based on onboarding status */}
            <Route
                path="/"
                element={
                    <Navigate to={profileCompleted ? "/dashboard" : "/onboarding"} replace />
                }
            />

            {/* Onboarding — accessible when profile is not yet complete.
                Covers both the base-info form and, once that's saved, the
                identity verification step (see Onboarding.tsx's own
                "form" | "verify" phases). Deliberately NOT behind
                RequireCompletedProfile - it's how the flag gets set. */}
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Identity verification capture flow — navigated to from
                Onboarding's "Verify Identity" button, navigates back to
                /onboarding on success or cancel. Same reasoning as above:
                not behind the completed-profile gate. */}
            <Route path="/verify-identity" element={<VerifyIdentity />} />

            {/* ── Authenticated app pages — all require a completed AND
                verified profile ── */}
            <Route element={<RequireCompletedProfile />}>

                <Route path="/dashboard" element={<Dashboard />} />

                {/* Seeker-only pages */}
                <Route
                    path="/requests"
                    element={
                        <RequireSeeker><MyRequests /></RequireSeeker>
                    }
                />

                {/* Donor-only pages */}
                <Route
                    path="/posts"
                    element={
                        <RequireDonor><MyPosts /></RequireDonor>
                    }
                />
                <Route
                    path="/available-requests"
                    element={
                        <RequireDonor><AvailableRequests /></RequireDonor>
                    }
                />

                <Route
                    path="/candidates"
                    element={
                        <RequireSeeker><Candidates /></RequireSeeker>
                    }
                />

                {/* Seeker-only — requires CanViewBloodAvailabilityPredictions */}
                <Route
                    path="/predict"
                    element={
                        <RequireSeeker><BloodAvailability /></RequireSeeker>
                    }
                />

                {/* All authenticated users */}
                <Route path="/conversations" element={<Conversations />} />

                {/* Independent of Conversations — see DamiFYP.Application.Features.BotAssistant */}
                <Route path="/ask-bot" element={<AskBot />} />

                <Route path="/account" element={<AccountSettings />} />

                {/* TODO: Add a /conversations/:id page for individual chat view */}

            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
    );
}

// ── Root component ─────────────────────────────────────────────────────────

export default function App() {
    return (
        // UserProvider makes the current user's profile available to all pages.
        // It reads from sessionStorage first, then falls back to the Keycloak token.
        // ConversationsProvider owns the single app-wide SignalR connection and the
        // unread-count state, so it must wrap BrowserRouter too — the sidebar badge
        // (rendered by AppLayout on every page) needs it even outside /conversations.
        <UserProvider>
            <ConversationsProvider>
                <BrowserRouter>
                    {/* DonationMatchToast must be inside BrowserRouter to use useNavigate,
                        and inside ConversationsProvider to read the pending notification. */}
                    <DonationMatchToast />
                    <AppRoutes />
                </BrowserRouter>
            </ConversationsProvider>
        </UserProvider>
    );
}
