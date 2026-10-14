import { sameOrigin } from "@/lib/auth/github-policy";
import { resolveActor } from "@/lib/chat/identity";
import { chatEnv, chatRuntime, json } from "@/lib/chat/runtime";

export async function DELETE(req: Request, ctx: RouteContext<"/api/mcp/keys/[id]">) {
  if (!sameOrigin(req)) return json({ error: "Same-origin request required", code: "forbidden" }, 403);
  const env = chatEnv();
  const { db } = await chatRuntime();
  if (!env.CHAT_COOKIE_SECRET || !db) return json({ error: "Storage unavailable", code: "unavailable" }, 503);
  const actor = await resolveActor(req, env.CHAT_COOKIE_SECRET);
  if (!actor.authenticated || !actor.uid) return json({ error: "Sign in first", code: "unauthorized" }, 401);
  const { id } = await ctx.params;
  const result = await db.prepare("UPDATE api_clients SET revoked_at = unixepoch('subsec') * 1000 WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL").bind(id, actor.uid).run();
  if (!Number((result.meta as { changes?: number } | undefined)?.changes ?? 0)) return json({ error: "Key not found", code: "not_found" }, 404);
  return json({ ok: true });
}
