import { BusinessRole } from "../types";

export function userIsDonor(role: BusinessRole): boolean {
    return role === BusinessRole.Donor || role === BusinessRole.DonorAndSeeker;
}

export function userIsSeeker(role: BusinessRole): boolean {
    return role === BusinessRole.Seeker || role === BusinessRole.DonorAndSeeker;
}

export function getRoleLabel(role: BusinessRole): string {
    switch (role) {
        case BusinessRole.Donor:          return "Donor";
        case BusinessRole.Seeker:         return "Seeker";
        case BusinessRole.DonorAndSeeker: return "Donor & Seeker";
        case BusinessRole.Admin:          return "Admin";
        case BusinessRole.ManageAccount:  return "Account Manager";
        default:                          return "Unknown";
    }
}

export function getRoleBadgeStyle(role: BusinessRole): { background: string; color: string } {
    switch (role) {
        case BusinessRole.Donor:          return { background: "#fee2e2", color: "#991b1b" };
        case BusinessRole.Seeker:         return { background: "#dbeafe", color: "#1e40af" };
        case BusinessRole.DonorAndSeeker: return { background: "#f3e8ff", color: "#6b21a8" };
        default:                          return { background: "#f3f4f6", color: "#374151" };
    }
}

// Extract a BusinessRole value from Keycloak realm_access.roles strings.
// TODO: BACKEND – Verify that Keycloak realm roles use these exact string names
//   (they must match the BusinessRole enum names configured in the Keycloak realm).
export function extractRoleFromKeycloakRoles(roles: string[]): BusinessRole {
    if (roles.includes("DonorAndSeeker")) return BusinessRole.DonorAndSeeker;
    if (roles.includes("Donor"))          return BusinessRole.Donor;
    if (roles.includes("Seeker"))         return BusinessRole.Seeker;
    if (roles.includes("Admin"))          return BusinessRole.Admin;
    if (roles.includes("ManageAccount"))  return BusinessRole.ManageAccount;
    return BusinessRole.None;
}
