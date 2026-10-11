import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { chatEnv, type ChatEnv } from "./config";
import type { D1Like } from "./store";
import { NO_STORE } from "@/lib/server/http";

/** Cloudflare bindings for /chat (D1 + waitUntil). Returns nulls outside Workers. */
export async function chatRuntime(): Promise<{ db: D1Like | null; waitUntil: (p: Promise<unknown>) => void }> {
  try {
    const cf = await getCloudflareContext({ async: true });
    const env = cf.env as unknown as { DB?: D1Like };
    return { db: env.DB ?? null, waitUntil: (p) => cf.ctx.waitUntil(p) };
  } catch (err) {
    console.warn("[chat] no Cloudflare context:", (err as Error)?.name);
    return { db: null, waitUntil: () => undefined };
  }
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extra } });
}

export type Unavailable = { code: "disabled" | "not_configured" | "no_database"; message: string };

/** Why chat cannot run right now (null when it can). Messages are bilingual and secret-free. */
export function unavailable(env: ChatEnv, db: D1Like | null): Unavailable | null {
  if (env.CHAT_ENABLED !== "true") return { code: "disabled", message: "Chat is turned off right now. / ปิดแชตชั่วคราว" };
  if (!env.OPENAI_API_KEY || !env.CHAT_COOKIE_SECRET) return { code: "not_configured", message: "Chat is not configured on this server. / เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าแชต" };
  if (!db) return { code: "no_database", message: "Chat storage is unavailable. / ระบบจัดเก็บแชตไม่พร้อมใช้งาน" };
  return null;
}

export { chatEnv };
