import {
    BrowserRouter,
    Routes,
    Route,
    Navigate
} from "react-router-dom";

import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard.tsx";


function App() {

    const completed =
        sessionStorage.getItem("profileCompleted")
        === "true";

    return (
        <BrowserRouter>

            <Routes>

                <Route
                    path="/"
                    element={
                        completed
                            ?
                            <Navigate to="/dashboard" />
                            :
                            <Navigate to="/onboarding" />
                    }
                />


                <Route
                    path="/onboarding"
                    element={<Onboarding />}
                />


                <Route
                    path="/dashboard"
                    element={
                    <Dashboard />
                    }
                />

            </Routes>

        </BrowserRouter>
    );
}


export default App;
