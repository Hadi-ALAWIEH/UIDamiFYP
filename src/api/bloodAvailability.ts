import { apiFetch } from "./client";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES – must match BloodAvailabilityViewModels.cs in the backend
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/BloodAvailability/Metadata
// All dropdown options come from here so the form stays in sync with the model.
export interface BloodAvailabilityMetadata {
    hospitals:      string[];
    hospitalSizes:  string[];
    months:         string[];
    bloodTypes:     string[];   // already in display format: "A+", "O-", etc.
    targetClasses:  string[];   // possible prediction output labels
    testAccuracy:   number;     // 0–1 float, multiply by 100 for percentage
}

// Maps whatever string the metadata returns → BloodTypeName integer enum
// (APositive=0, ANegative=1, BPositive=2, BNegative=3, OPositive=4, ONegative=5)
export const BLOOD_TYPE_LABEL_TO_ENUM: Record<string, number> = {
    "APositive": 0, "A+": 0,
    "ANegative": 1, "A-": 1,
    "BPositive": 2, "B+": 2,
    "BNegative": 3, "B-": 3,
    "OPositive": 4, "O+": 4,
    "ONegative": 5, "O-": 5,
};

// The body sent to Predict and PredictBatch
// TODO: BACKEND – field names must stay camelCase to match .NET JSON serialisation
export interface PredictionPayload {
    hospital:           string;
    hospitalSize:       string;
    month:              string;
    bloodType:          number;  // BloodTypeName integer enum (APositive=0 … ONegative=5)
    openingStock:       number;
    donationsReceived:  number;
    bloodRequests:      number;
    holidaySeason:      boolean;
    summerSeason:       boolean;
}

// POST /api/BloodAvailability/Predict response
// POST /api/BloodAvailability/PredictBatch response (array of this)
export interface PredictionResult {
    availability:  string;                  // e.g. "High", "Low", "Medium"
    probabilities: Record<string, number>;  // e.g. { "High": 0.85, "Low": 0.15 }
}

// ─────────────────────────────────────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────────────────────────────────────

// Requires: CanViewBloodAvailabilityPredictions (Seeker, ManageAccount)
export async function getBloodAvailabilityMetadata(): Promise<BloodAvailabilityMetadata> {
    return apiFetch("/api/BloodAvailability/Metadata");
}

// Single prediction
export async function predictAvailability(
    payload: PredictionPayload,
): Promise<PredictionResult> {
    return apiFetch("/api/BloodAvailability/Predict", {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}

// Batch — compare multiple scenarios at once
export async function predictAvailabilityBatch(
    predictions: PredictionPayload[],
): Promise<PredictionResult[]> {
    return apiFetch("/api/BloodAvailability/PredictBatch", {
        method: "POST",
        body:   JSON.stringify({ predictions }),
    });
}
