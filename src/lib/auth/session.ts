import "server-only";
/**
 * Revocable sign-in sessions (migration 0009, `auth_sessions`). Every provider (Cursor, Google,
 * GitHub, DevStack password) issues one on sign-in. Sign-out deletes the row, so a copied cookie
 * stops working. Fails closed: with no D1, a session cookie is not accepted.
 */

import { AUTH_COOKIE_MAX_AGE } from "@/lib/auth/oauth-flow";
import { chatRuntime } from "@/lib/chat/runtime";
import { resolveActor, signSession, type SessionCheck } from "@/lib/chat/identity";
import type { D1Like } from "@/lib/chat/store";

export const SESSION_MAX_AGE = AUTH_COOKIE_MAX_AGE;

/** Insert a session row and return the signed cookie value. */
export async function issueSession(db: D1Like, uid: string, secret: string, now = Date.now()): Promise<string> {
  const sid = crypto.randomUUID();
  await db.prepare("INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)").bind(sid, uid, now + SESSION_MAX_AGE * 1000).run();
  return signSession(uid, sid, secret);
}

export function sessionCheck(db: D1Like | null, now: () => number = Date.now): SessionCheck {
  return async (uid, sid) => {
    if (!db) return false;
    const row = await db.prepare("SELECT 1 AS ok FROM auth_sessions WHERE id = ?1 AND user_id = ?2 AND expires_at > ?3").bind(sid, uid, now()).first<{ ok: number }>();
    return !!row;
  };
}

/** Delete one session, or every session of the user (`everywhere`). Also clears expired rows for that user. */
export async function revokeSessions(db: D1Like, uid: string, sid: string | null, everywhere: boolean, now = Date.now()): Promise<void> {
  const stmts = [db.prepare("DELETE FROM auth_sessions WHERE user_id = ?1 AND expires_at <= ?2").bind(uid, now)];
  if (everywhere) stmts.push(db.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(uid));
  else if (sid) stmts.push(db.prepare("DELETE FROM auth_sessions WHERE id = ?1 AND user_id = ?2").bind(sid, uid));
  await db.batch(stmts);
}

/** `resolveActor` with the D1 session check wired in. Use this in route handlers. */
export async function resolveSignedIn(req: Request, secret: string, opts: { issue?: boolean } = {}) {
  let db: D1Like | null | undefined;
  const check: SessionCheck = async (uid, sid) => {
    if (db === undefined) db = (await chatRuntime()).db;
    return sessionCheck(db)(uid, sid);
  };
  return resolveActor(req, secret, { ...opts, check });
}
