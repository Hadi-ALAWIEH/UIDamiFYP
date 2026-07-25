import { BloodTypeName } from "../types";

// Display label for each BloodTypeName enum value
const LABELS: Record<BloodTypeName, string> = {
    [BloodTypeName.APositive]:  "A+",
    [BloodTypeName.ANegative]:  "A-",
    [BloodTypeName.BPositive]:  "B+",
    [BloodTypeName.BNegative]:  "B-",
    [BloodTypeName.OPositive]:  "O+",
    [BloodTypeName.ONegative]:  "O-",
    [BloodTypeName.AbPositive]: "AB+",
    [BloodTypeName.AbNegative]: "AB-",
};

export function bloodTypeLabel(value: BloodTypeName): string {
    return LABELS[value] ?? "Unknown";
}

// Convert the backend enum name string (e.g. "OPositive") to display label
// Used when the backend sends the enum as a string instead of an integer
export function bloodTypeNameStringToLabel(name: string): string {
    const map: Record<string, string> = {
        APositive:  "A+",
        ANegative:  "A-",
        BPositive:  "B+",
        BNegative:  "B-",
        OPositive:  "O+",
        ONegative:  "O-",
        AbPositive: "AB+",
        AbNegative: "AB-",
    };
    return map[name] ?? name;
}

// All options for a <select> element
export const BLOOD_TYPE_OPTIONS = [
    { value: BloodTypeName.APositive,  label: "A+"  },
    { value: BloodTypeName.ANegative,  label: "A-"  },
    { value: BloodTypeName.BPositive,  label: "B+"  },
    { value: BloodTypeName.BNegative,  label: "B-"  },
    { value: BloodTypeName.OPositive,  label: "O+"  },
    { value: BloodTypeName.ONegative,  label: "O-"  },
    { value: BloodTypeName.AbPositive, label: "AB+" },
    { value: BloodTypeName.AbNegative, label: "AB-" },
] as const;
