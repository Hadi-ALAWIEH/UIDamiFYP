import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { UserProvider, useUser } from "./context/UserContext.tsx";
import Onboarding       from "./pages/Onboarding.tsx";
import Dashboard        from "./pages/Dashboard.tsx";
import MyRequests       from "./pages/MyRequests.tsx";
import MyPosts          from "./pages/MyPosts.tsx";
import AvailableRequests from "./pages/AvailableRequests.tsx";
import Conversations      from "./pages/Conversations.tsx";
import BloodAvailability  from "./pages/BloodAvailability.tsx";
import Candidates         from "./pages/Candidates.tsx";
import type {JSX} from "react";

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

            {/* Onboarding — accessible when profile is not yet complete */}
            <Route path="/onboarding" element={<Onboarding />} />

            {/* ── Authenticated app pages ── */}

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

            {/* TODO: Add a /profile page for viewing/editing user details */}
            {/* TODO: Add a /conversations/:id page for individual chat view */}

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
        <UserProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </UserProvider>
    );
}
