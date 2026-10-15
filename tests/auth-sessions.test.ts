import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/runtime", () => ({ chatRuntime: async () => ({ db: null, waitUntil: () => undefined }) }));

import { issueSession, revokeSessions, sessionCheck } from "@/lib/auth/session";
import { AUTH_COOKIE, readSession, resolveActor, signUid } from "@/lib/chat/identity";
import type { D1Like, D1Stmt } from "@/lib/chat/store";

const SECRET = "test-cookie-secret-at-least-32-characters";
const UID = "11111111-1111-4111-8111-111111111111";

type Row = { id: string; user_id: string; expires_at: number };

/** Just enough of D1 for auth_sessions. */
function fakeD1(): D1Like & { rows: Row[] } {
  const rows: Row[] = [];
  const stmt = (sql: string, args: unknown[] = []): D1Stmt => ({
    bind: (...values: unknown[]) => stmt(sql, values),
    async first<T>() {
      const [id, uid, now] = args as [string, string, number];
      return (rows.some((r) => r.id === id && r.user_id === uid && r.expires_at > now) ? { ok: 1 } : null) as T | null;
    },
    async all() {
      return { results: [] };
    },
    async run() {
      if (sql.startsWith("INSERT")) {
        const [id, user_id, expires_at] = args as [string, string, number];
        rows.push({ id, user_id, expires_at });
      } else if (sql.includes("expires_at <=")) {
        const [uid, now] = args as [string, number];
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === uid && rows[i].expires_at <= now) rows.splice(i, 1);
      } else if (sql.includes("WHERE id = ?1")) {
        const [id, uid] = args as [string, string];
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].id === id && rows[i].user_id === uid) rows.splice(i, 1);
      } else if (sql.startsWith("DELETE")) {
        const [uid] = args as [string];
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === uid) rows.splice(i, 1);
      }
      return {};
    },
  });
  return { rows, prepare: (sql: string) => stmt(sql), batch: async (s: D1Stmt[]) => Promise.all(s.map((x) => x.run())) };
}

function withCookie(value: string): Request {
  return new Request("https://devstack.bid/api/auth/session", { headers: { cookie: `${AUTH_COOKIE}=${encodeURIComponent(value)}` } });
}

describe("revocable sign-in sessions", () => {
  it("accepts a live session and refuses it after sign-out", async () => {
    const db = fakeD1();
    const value = await issueSession(db, UID, SECRET);
    expect(value.split(".")).toHaveLength(3);
    expect(db.rows).toHaveLength(1);
    const check = sessionCheck(db);
    expect((await resolveActor(withCookie(value), SECRET, { check })).uid).toBe(UID);
    const sid = (await readSession(value, SECRET))!.sid;
    await revokeSessions(db, UID, sid, false);
    expect(db.rows).toHaveLength(0);
    expect((await resolveActor(withCookie(value), SECRET, { check })).authenticated).toBe(false);
  });

  it("signs out everywhere and expires old rows", async () => {
    const db = fakeD1();
    const now = 1_700_000_000_000;
    const a = await issueSession(db, UID, SECRET, now);
    await issueSession(db, UID, SECRET, now);
    expect(await sessionCheck(db, () => now + 31 * 86_400_000)(UID, (await readSession(a, SECRET))!.sid)).toBe(false);
    await revokeSessions(db, UID, null, true, now);
    expect(db.rows).toHaveLength(0);
  });

  it("fails closed without a checker or with a tampered signature", async () => {
    const db = fakeD1();
    const value = await issueSession(db, UID, SECRET);
    expect((await resolveActor(withCookie(value), SECRET)).authenticated).toBe(false);
    const tampered = value.slice(0, -2) + (value.endsWith("AA") ? "BB" : "AA");
    expect((await resolveActor(withCookie(tampered), SECRET, { check: sessionCheck(db) })).authenticated).toBe(false);
    expect(await readSession(value, "another-secret-that-is-32-chars-long!!")).toBeNull();
  });

  it("still accepts the legacy uid cookie", async () => {
    const legacy = await signUid(UID, SECRET);
    expect((await resolveActor(withCookie(legacy), SECRET)).uid).toBe(UID);
  });
});
