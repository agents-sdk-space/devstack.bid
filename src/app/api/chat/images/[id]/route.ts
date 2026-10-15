import { connection } from "next/server";
import { resolveSignedIn } from "@/lib/auth/session";

import { chatEnv, chatRuntime, json, unavailable } from "@/lib/chat/runtime";
import { loadInlineImage } from "@/lib/chat/store";

/** GET /api/chat/images/:id -> generated image bytes (owner only, stored inline in D1 until R2 is enabled). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const env = chatEnv();
  const { db } = await chatRuntime();
  if (unavailable(env, db) || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Not found" }, 404);
  const actor = await resolveSignedIn(req, env.CHAT_COOKIE_SECRET!);
  if (!actor.uid) return json({ error: "Not found" }, 404);
  const uid = actor.uid;
  const img = await loadInlineImage(db!, uid, id);
  if (!img) return json({ error: "Not found" }, 404);
  const bytes = img.data instanceof Uint8Array ? img.data : Array.isArray(img.data) ? new Uint8Array(img.data) : new Uint8Array(img.data);
  const mime = /^image\/(webp|png|jpeg)$/.test(img.mime) ? img.mime : "application/octet-stream";
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff", "Content-Disposition": `inline; filename="devstack-${id.slice(0, 8)}.webp"` },
  });
}
