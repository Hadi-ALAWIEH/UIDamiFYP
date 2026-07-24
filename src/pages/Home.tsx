import { login } from "../auth/Keycloak.ts";


function Home() {

    return (

        <div style={styles.container}>


            <h1 style={styles.title}>
                DamiFYP
            </h1>


            <p>
                Connecting blood donors with people in need.
            </p>


            <button
                style={styles.button}
                onClick={login}
            >
                Login
            </button>


        </div>

    );

}



const styles = {

    container: {

        height: "100vh",

        display: "flex",

        flexDirection: "column" as const,

        justifyContent: "center",

        alignItems: "center",

        backgroundColor: "white",

    },


    title: {

        color: "#c62828",

        fontSize: "48px",

    },


    button: {

        backgroundColor: "#c62828",

        color: "white",

        padding: "12px 30px",

        border: "none",

        borderRadius: "6px",

        cursor: "pointer",

        fontSize: "18px",

    }

};


export default Home;
