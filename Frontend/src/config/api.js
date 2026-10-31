const configuredApiUrl = import.meta.env.VITE_API_URL || "";

export const API_ORIGIN = configuredApiUrl.replace(/\/+$/, "");
export const API_BASE_URL = `${API_ORIGIN}/api`;