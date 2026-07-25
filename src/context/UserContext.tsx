import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { keycloak } from "../auth/Keycloak.ts";
import { BusinessRole, type UserProfileData } from "../types";
import { extractRoleFromKeycloakRoles } from "../utils/roles";
import { getUserProfile } from "../api/profile";

// sessionStorage key for persisted profile
const STORAGE_KEY = "dami_user_profile";

// ── Persistence helpers ────────────────────────────────────────────────────

function loadFromStorage(): UserProfileData | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as UserProfileData) : null;
    } catch {
        return null;
    }
}

function saveToStorage(p: UserProfileData): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function clearStorage(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("profileCompleted");
}

// Partial fallback derived from the Keycloak JWT when sessionStorage is empty.
// TODO: BACKEND – Replace this with a GET /api/me call once that endpoint exists.
function partialProfileFromToken(): UserProfileData | null {
    const parsed = keycloak.tokenParsed as Record<string, unknown> | undefined;
    if (!parsed) return null;

    const realmRoles = (
        (parsed.realm_access as { roles?: string[] } | undefined)?.roles ?? []
    );
    const role = extractRoleFromKeycloakRoles(realmRoles);
    if (role === BusinessRole.None) return null;

    return {
        userId:       0,      // unknown without a /api/me endpoint
        name:         (parsed.name as string | undefined)
                      ?? (parsed.preferred_username as string | undefined)
                      ?? "User",
        email:        (parsed.email as string | undefined) ?? "",
        businessRole: role,
        isAvailable:  false,
    };
}

// ── Context shape ──────────────────────────────────────────────────────────

interface UserContextValue {
    profile:        UserProfileData | null;
    profileLoading: boolean;
    isDonor:        boolean;
    isSeeker:       boolean;
    setProfile:     (p: UserProfileData) => void;
    clearProfile:   () => void;
    refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: React.ReactNode }) {
    // Initialise from sessionStorage for an instant first render, then replace
    // with fresh data from the API immediately after mount.
    const [profile, setProfileState] = useState<UserProfileData | null>(() => {
        return loadFromStorage() ?? partialProfileFromToken();
    });
    const [profileLoading, setProfileLoading] = useState(true);

    const isDonor  = profile?.businessRole === BusinessRole.Donor
                  || profile?.businessRole === BusinessRole.DonorAndSeeker;
    const isSeeker = profile?.businessRole === BusinessRole.Seeker
                  || profile?.businessRole === BusinessRole.DonorAndSeeker;

    const setProfile = useCallback((p: UserProfileData) => {
        saveToStorage(p);
        setProfileState(p);
    }, []);

    const clearProfile = useCallback(() => {
        clearStorage();
        setProfileState(null);
    }, []);

    // Fetch the real profile from GET /api/GetUserProfile on mount.
    // This ensures businessRole, bloodTypeName etc. are always up to date.
    const refreshProfile = useCallback(async () => {
        setProfileLoading(true);
        try {
            const fresh = await getUserProfile();
            setProfile(fresh);
        } catch {
            // Keep whatever we already have (sessionStorage / token fallback)
        } finally {
            setProfileLoading(false);
        }
    }, [setProfile]);

    useEffect(() => {
        refreshProfile();
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <UserContext.Provider value={{
            profile, profileLoading,
            isDonor, isSeeker,
            setProfile, clearProfile, refreshProfile,
        }}>
            {children}
        </UserContext.Provider>
    );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useUser(): UserContextValue {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
    return ctx;
}
