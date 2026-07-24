import {logout} from "../auth/Keycloak.ts"
function Dashboard() {
    return (
        <div>
            <div>
                this is the dashboard
            </div>

            <button onClick={logout}>
                Logout
            </button>
        </div>
    )
}

export default Dashboard;