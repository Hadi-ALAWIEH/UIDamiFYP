import { useState } from "react";
import {
    completeUserOnboarding
} from "../api/profile";
import {
   logout
} from "../auth/Keycloak.ts";


function Onboarding() {


    const [name, setName] = useState("");

    const [businessRole, setBusinessRole] =
        useState<number>(1);

    const [latitude, setLatitude] =
        useState<number | undefined>();

    const [longitude, setLongitude] =
        useState<number | undefined>();

    const [isAvailable, setIsAvailable] =
        useState(true);


    const [loading, setLoading] =
        useState(false);



    async function handleSubmit() {

        const payload = {

            name,

            businessRole,

            latitude,

            longitude,

            isAvailable

        };


        try {

            setLoading(true);


            await completeUserOnboarding(
                payload
            );


            alert(
                "Your profile has been completed!"
            );


        }
        finally {

            setLoading(false);

        }

    }



    return (

        <div style={styles.page}>


            <div style={styles.card}>


                <div style={styles.icon}>
                    🩸
                </div>


                <h1 style={styles.title}>
                    Complete Your DamiFYP Profile
                </h1>


                <p style={styles.subtitle}>
                    Tell us how you want to contribute
                    to the blood donation community.
                </p>



                <label>
                    Name
                </label>

                <input
                    style={styles.input}
                    value={name}
                    onChange={
                        e => setName(e.target.value)
                    }
                    placeholder="Your full name"
                />



                <label>
                    Your role
                </label>


                <select
                    style={styles.input}
                    value={businessRole}
                    onChange={
                        e =>
                            setBusinessRole(
                                Number(e.target.value)
                            )
                    }
                >

                    <option value={1}>
                        Blood Donor
                    </option>


                    <option value={2}>
                        Blood Seeker
                    </option>

                </select>




                <label>
                    Location
                </label>


                <input
                    style={styles.input}
                    type="number"
                    placeholder="Latitude"
                    value={latitude ?? ""}
                    onChange={
                        e =>
                            setLatitude(
                                e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                            )
                    }
                />


                <input
                    style={styles.input}
                    type="number"
                    placeholder="Longitude"
                    value={longitude ?? ""}
                    onChange={
                        e =>
                            setLongitude(
                                e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                            )
                    }
                />



                <div style={styles.switchRow}>

                    <span>
                        Available for donation
                    </span>


                    <input
                        type="checkbox"
                        checked={isAvailable}
                        onChange={
                            e =>
                                setIsAvailable(
                                    e.target.checked
                                )
                        }
                    />

                </div>




                <button
                    style={styles.button}
                    onClick={handleSubmit}
                    disabled={loading}
                >

                    {
                        loading
                            ? "Creating profile..."
                            : "Complete Profile"
                    }

                </button>

                <button
                    style={styles.button}
                    onClick={logout}
                >
                    logout
                </button>

            </div>


        </div>

    );

}



const styles = {


    page: {

        minHeight: "100vh",

        display:"flex",

        justifyContent:"center",

        alignItems:"center",

        background:
            "linear-gradient(135deg,#fff,#ffe8e8)"

    },


    card: {

        width:"430px",

        padding:"40px",

        borderRadius:"20px",

        background:"white",

        boxShadow:
            "0 15px 40px rgba(0,0,0,0.12)",

        display:"flex",

        flexDirection:"column" as const,

        gap:"12px"

    },


    icon: {

        margin:"auto",

        width:"70px",

        height:"70px",

        borderRadius:"50%",

        background:"#c62828",

        color:"white",

        display:"flex",

        justifyContent:"center",

        alignItems:"center",

        fontSize:"32px"

    },


    title: {

        color:"#c62828",

        textAlign:"center" as const

    },


    subtitle: {

        color:"#666",

        textAlign:"center" as const

    },


    input: {

        padding:"12px",

        borderRadius:"8px",

        border:"1px solid #ddd",

        fontSize:"15px"

    },


    switchRow: {

        display:"flex",

        justifyContent:"space-between",

        alignItems:"center",

        marginTop:"10px"

    },


    button: {

        marginTop:"20px",

        padding:"14px",

        borderRadius:"10px",

        border:"none",

        background:"#c62828",

        color:"white",

        fontSize:"16px",

        cursor:"pointer"

    }

};


export default Onboarding;
