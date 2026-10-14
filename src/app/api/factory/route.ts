import { connection } from "next/server";
import { FACTORY_MODELS } from "@/lib/chat/agent-config";
import { REQUIRED_SCOPES, factoryUnavailable } from "@/lib/chat/factory";
import { resolveActor } from "@/lib/chat/identity";
import { chatEnv, chatRuntime, json } from "@/lib/chat/runtime";
import { listConversations } from "@/lib/chat/store";

/** GET /api/factory -> { enabled, models, scopes, limits, sessions[] } (no key needed). */
export async function GET(req: Request) {
  await connection();
  const env = chatEnv();
  const { db } = await chatRuntime();
  const why = factoryUnavailable(env, db);
  const base = { models: FACTORY_MODELS, scopes: REQUIRED_SCOPES, limits: { sessionsPerHour: env.FACTORY_SESSIONS_PER_HOUR, turnsPerHour: env.FACTORY_TURNS_PER_HOUR, maxInputChars: env.CHAT_MAX_INPUT_CHARS } };
  if (why) return json({ enabled: false, unavailable: why, ...base, sessions: [] });
  const uid = (await resolveActor(req, env.CHAT_COOKIE_SECRET!)).uid;
  const rows = uid ? await listConversations(db!, uid, 20, "factory") : [];
  return json({
    enabled: true,
    ...base,
    sessions: rows.map((c) => ({ id: c.id, title: c.title, model: c.model, environment: c.environment, updatedAt: c.updated_at })),
  });
}
