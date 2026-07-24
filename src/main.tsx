import { initKeycloak } from "./auth/Keycloak";
import { checkProfileExistence } from "./api/profile";
import {createRoot} from "react-dom/client";
import App from "./App.tsx";


async function bootstrap()
{
    await initKeycloak();


    const profile =
        await checkProfileExistence();


    sessionStorage.setItem(
        "profileCompleted",
        String(profile.completed)
    );


    createRoot(
        document.getElementById("root")!
    )
        .render(
            <App/>
        );
}


bootstrap();
