import "server-only";
import { json } from "@/lib/chat/runtime";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { HttpError, readJsonBody } from "@/lib/server/http";
import { LlmError } from "./llm";

export async function body<T>(req: Request, max = 8_000): Promise<T | Response> {
  try {
    return ((await readJsonBody(req, max)) ?? {}) as T;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof LlmError) return json({ error: err.message, code: err.code }, err.code === "blocked" ? 503 : 502);
  const e = serviceErrorBody(err);
  return json(e.body, e.status);
}
