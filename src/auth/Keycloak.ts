import Keycloak from "keycloak-js";


const keycloakBaseUrl =
    import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8080";

const keycloakRealm =
    import.meta.env.VITE_KEYCLOAK_REALM ?? "DamiRealm";

const keycloakClientId =
    "damifyp-client";


export const keycloak = new Keycloak({
    url: keycloakBaseUrl,
    realm: keycloakRealm,
    clientId: keycloakClientId,
});


export async function initKeycloak() {
    return await keycloak.init({

        onLoad: "login-required",

        checkLoginIframe: false,

        pkceMethod: "S256",

        // redirectUri: `${window.location.origin}/onboarding`
        redirectUri: window.location.origin

    });
}


export function login() {

    return keycloak.login({
        // redirectUri: `${window.location.origin}/onboarding`,
        redirectUri: `${window.location.origin}`,
    });

}


export function logout() {

    localStorage.removeItem(
        "bloodlink_access_token"
    );


    return keycloak.logout({
        redirectUri: window.location.origin,
    });

}
