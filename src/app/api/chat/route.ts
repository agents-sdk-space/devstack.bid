import { connection } from "next/server";
import { publicLimits, quotaConfig } from "@/lib/chat/config";
import { quotaStatus } from "@/lib/chat/limits";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { CHAT_COOKIE, readCookie, verifyUid } from "@/lib/chat/identity";
import { chatEnv, chatRuntime, json, unavailable } from "@/lib/chat/runtime";
import { listConversations } from "@/lib/chat/store";
import { AGENT_NAME } from "@/lib/chat/agent-config";

/** GET /api/chat -> { enabled, unavailable?, agent, limits, conversations[] } for the current cookie. */
/** GET /api/chat?channel=user|dev -> { enabled, unavailable?, agent, limits, models, quota, conversations[] }. */
export async function GET(req: Request) {
  await connection();
  const env = chatEnv();
  const { db } = await chatRuntime();
  const channel = new URL(req.url).searchParams.get("channel") === "dev" ? "dev" : "user";
  const server = serverEnv();
  const agentWhy = unavailable(env, db);
  const models =
    channel === "dev"
      ? [{ mode: "agent", provider: "openai", model: env.CHAT_MODEL, available: !agentWhy }]
      : [
          { mode: "general", provider: "workers-ai", model: env.WAI_MODEL, available: true },
          { mode: "thai", provider: "workers-ai", model: env.WAI_THAI_MODEL, available: true },
          { mode: "code", provider: "workers-ai", model: env.WAI_CODE_MODEL, available: true },
          { mode: "strong", provider: "huggingface", model: server.HF_MODEL, available: Boolean(server.HF_TOKEN) },
          { mode: "image", provider: "workers-ai", model: env.WAI_IMAGE_MODEL, available: env.FREE_DAILY_IMAGES > 0 },
        ];
  const base = { channel, agent: AGENT_NAME, limits: publicLimits(env), models };
  const storageOk = Boolean(db && env.CHAT_COOKIE_SECRET && env.CHAT_ENABLED === "true");
  const why = channel === "dev" ? agentWhy : storageOk ? null : { code: "unavailable", message: "Chat is unavailable right now. / ตอนนี้ใช้งานแชตไม่ได้" };
  if (why || !storageOk) return json({ enabled: false, unavailable: why ?? { code: "unavailable", message: "Chat is unavailable right now. / ตอนนี้ใช้งานแชตไม่ได้" }, ...base, conversations: [] });
  const uid = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), env.CHAT_COOKIE_SECRET!);
  const conversations = uid ? await listConversations(db!, uid, 50, "chat", channel) : [];
  const quota = await quotaStatus(db!, clientIp(req), uid, quotaConfig(env), channel);
  return json({
    enabled: true,
    ...base,
    quota,
    conversations: conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at, model: c.model })),
  });
}
