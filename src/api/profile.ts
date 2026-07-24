import {keycloak} from "../auth/Keycloak.ts";

export interface CompleteUserOnboardingRequest {
    name: string;
    businessRole: number;
    latitude?: number;
    longitude?: number;
    isAvailable: boolean;
}


export async function completeUserOnboarding(
    payload: CompleteUserOnboardingRequest
) {

    console.log("Sending onboarding payload:", payload);
    await fetch(
        "https://localhost:7212/api/CompleteOnboarding",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization":
                    `Bearer ${keycloak.token}`
            },
            body: JSON.stringify(payload)
        }
    );
    return true;
}
export interface CheckProfileExistenceResponse {
    completed: boolean;
}


export async function checkProfileExistence()
    : Promise<CheckProfileExistenceResponse>
{

    const response = await fetch(
        "https://localhost:7212/api/CheckProfileExistence",
        {
            method: "GET",

            headers: {
                "Authorization":
                    `Bearer ${keycloak.token}`
            }
        }
    );


    if(!response.ok)
    {
        throw new Error(
            "Failed to check profile existence"
        );
    }


    return await response.json();

}