import { keycloak } from "../auth/Keycloak.ts";

// TODO: BACKEND – Set VITE_API_URL in .env.local to change the base URL.
//   e.g. VITE_API_URL=https://api.damifyp.com
const BASE_URL = import.meta.env.VITE_API_URL ?? "https://localhost:7212";

export function authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${keycloak.token ?? ""}` };
}

// @ts-ignore
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly path: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export async function apiFetch<T = void>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...authHeader(),
            ...(options.headers ?? {}),
        },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new ApiError(res.status, body, path);
    }

    // 204 No Content or empty body
    if (res.status === 204 || res.headers.get("content-length") === "0") {
        return undefined as T;
    }

    return res.json() as Promise<T>;
}
