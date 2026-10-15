import { NO_STORE } from "@/lib/server/http";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
}

export function apiError(code: string, message: string, status: number, hint?: string, extraHeaders: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: { code, message, ...(hint ? { hint } : {}) } };
  return Response.json(body, { status, headers: { ...NO_STORE, "Content-Type": "application/json; charset=utf-8", ...extraHeaders } });
}
