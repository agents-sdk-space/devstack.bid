import { connection } from "next/server";
import { CHAT_COOKIE, readCookie, verifyUid } from "@/lib/chat/identity";
import { chatEnv, chatRuntime, json, unavailable } from "@/lib/chat/runtime";
import { archiveConversation, getConversation, listMessages, renameConversation } from "@/lib/chat/store";
import { readJsonBody, HttpError } from "@/lib/server/http";
import { cleanText } from "@/lib/sanitize";

const ID = /^[0-9a-f-]{36}$/;

async function context(req: Request, id: string) {
  const env = chatEnv();
  const { db } = await chatRuntime();
  const why = unavailable(env, db);
  if (why) return { error: json({ error: why.message, code: why.code }, 503) };
  if (!ID.test(id)) return { error: json({ error: "Not found" }, 404) };
  const uid = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), env.CHAT_COOKIE_SECRET!);
  if (!uid) return { error: json({ error: "Not found" }, 404) };
  return { db: db!, uid };
}

/** GET /api/chat/conversations/:id -> messages (owner only; others get 404). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const c = await context(req, id);
  if ("error" in c) return c.error;
  const conv = await getConversation(c.db, c.uid, id);
  if (!conv || conv.archived) return json({ error: "Not found" }, 404);
  const messages = await listMessages(c.db, id);
  return json({
    conversation: { id: conv.id, title: conv.title, model: conv.model, updatedAt: conv.updated_at },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tokensIn: m.tokens_in,
      tokensOut: m.tokens_out,
      model: m.model,
      createdAt: m.created_at,
      meta: m.meta ? JSON.parse(m.meta) : null,
    })),
  });
}

/** PATCH /api/chat/conversations/:id  { title?: string, archived?: true } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await context(req, id);
  if ("error" in c) return c.error;
  let body: { title?: unknown; archived?: unknown };
  try {
    body = ((await readJsonBody(req, 4096)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request" }, err instanceof HttpError ? err.status : 400);
  }
  let ok = false;
  if (body.archived === true) ok = await archiveConversation(c.db, c.uid, id);
  else if (typeof body.title === "string" && cleanText(body.title, 80)) ok = await renameConversation(c.db, c.uid, id, cleanText(body.title, 80));
  else return json({ error: "Nothing to update" }, 400);
  return ok ? json({ ok: true }) : json({ error: "Not found" }, 404);
}
