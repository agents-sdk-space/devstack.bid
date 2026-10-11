import "server-only";
import { AgentsApiError } from "./agents-api";
import type { ChatEnv } from "./config";
import type { D1Like } from "./store";

/**
 * Sandbox Factory helpers. The user's OpenAI key arrives in the `X-OpenAI-Key` header of each
 * request, is used for that request only, and is never stored, logged or echoed back.
 */

export const FACTORY_KEY_HEADER = "x-openai-key";
export const REQUIRED_SCOPES = ["api.agents.read", "api.agents.write", "api.responses.write"] as const;

export function readUserKey(req: Request): string | null {
  const raw = req.headers.get(FACTORY_KEY_HEADER)?.trim() ?? "";
  return /^sk-[A-Za-z0-9_-]{20,400}$/.test(raw) ? raw : null;
}

export function factoryUnavailable(env: ChatEnv, db: D1Like | null): { code: string; message: string } | null {
  if (env.FACTORY_ENABLED !== "true") return { code: "disabled", message: "Sandbox Factory is turned off right now. / ปิด Sandbox Factory ชั่วคราว" };
  if (!env.CHAT_COOKIE_SECRET) return { code: "not_configured", message: "Sandbox Factory is not configured on this server. / เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Sandbox Factory" };
  if (!db) return { code: "no_database", message: "Storage is unavailable. / ระบบจัดเก็บไม่พร้อมใช้งาน" };
  return null;
}

/** Map an upstream error from the user's key into a safe, bilingual message (no upstream body). */
export function upstreamMessage(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof AgentsApiError) {
    if (err.status === 401) return { status: 401, code: "key_rejected", message: "OpenAI rejected this key. Check that it's correct and active. / OpenAI ปฏิเสธ key นี้ ตรวจสอบว่าถูกต้องและยังใช้งานได้" };
    if (err.status === 403)
      return {
        status: 403,
        code: "missing_scope",
        message: `This key lacks a required permission (${REQUIRED_SCOPES.join(", ")}). / key นี้ไม่มีสิทธิ์ที่จำเป็น (${REQUIRED_SCOPES.join(", ")})`,
      };
    if (err.status === 404) return { status: 404, code: "not_found", message: "Session or agent not found in your account. / ไม่พบ session หรือ agent ในบัญชีของคุณ" };
    if (err.status === 429) return { status: 429, code: "upstream_rate_limited", message: "Your OpenAI account is rate limited or out of credit. / บัญชี OpenAI ของคุณติด rate limit หรือเครดิตหมด" };
    if (err.status === 400) return { status: 400, code: "upstream_invalid", message: "OpenAI rejected the request (model or settings may be unavailable for your account). / OpenAI ไม่รับคำขอนี้ (โมเดลหรือการตั้งค่าอาจใช้ไม่ได้กับบัญชีของคุณ)" };
  }
  return { status: 502, code: "upstream_error", message: "Couldn't reach OpenAI. Try again. / ติดต่อ OpenAI ไม่ได้ ลองใหม่อีกครั้ง" };
}
