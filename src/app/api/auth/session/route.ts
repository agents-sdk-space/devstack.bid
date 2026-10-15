import { connection } from "next/server";
import { resolveSignedIn } from "@/lib/auth/session";
import { chatEnv } from "@/lib/chat/config";

import { chatRuntime, json } from "@/lib/chat/runtime";
import { getAccount } from "@/lib/chat/store";

/** GET /api/auth/session — who the header should show. Null when signed out. */
export async function GET(req: Request) {
  await connection();
  const secret = chatEnv().CHAT_COOKIE_SECRET;
  if (!secret) return json({ account: null });
  const actor = await resolveSignedIn(req, secret);
  if (!actor.authenticated || !actor.uid) return json({ account: null });
  const { db } = await chatRuntime();
  if (!db) return json({ account: null });
  return json({ account: await getAccount(db, actor.uid) });
}
