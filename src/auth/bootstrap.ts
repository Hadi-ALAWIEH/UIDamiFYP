import { keycloak } from "./Keycloak";


export async function checkUserProfile() {

    const response = await fetch(
        "https://localhost:7212/api/CheckProfileExistence",
        {
            headers: {
                Authorization:
                    `Bearer ${keycloak.token}`
            }
        }
    );


    if(!response.ok)
    {
        return false;
    }


    const profile = await response.json();


    return profile.completed;
}