import { describe, expect, it } from "vitest";
import { resetStoreKeyCache, resolveSealKeys } from "@/lib/connections/credentials";
import { deleteEnv, listEnv, loadEnv, saveEnv, validEnvName } from "@/lib/connections/environment";
import { TOKEN_PROVIDERS } from "@/lib/connections/token-providers";
import { archiveKey, createRecorder, loadArchive, saveArchive, type R2Like } from "@/lib/chat/stream-archive";
import type { D1Like } from "@/lib/chat/store";

const COOKIE = "test-cookie-secret-at-least-32-characters";
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 7)));

/** Fake for user_env keyed by user|name. */
function fakeEnvDb(): D1Like & { rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  const stmt = (sql: string, a: unknown[] = []) => ({
    bind: (...x: unknown[]) => stmt(sql, x),
    async all() {
      const k = `${a[0]}|${a[1]}`;
      if (sql.startsWith("SELECT COUNT")) return { results: [{ n: [...rows.keys()].filter((r) => r.startsWith(`${a[0]}|`) && r !== k).length }] };
      if (sql.startsWith("INSERT INTO user_env")) rows.set(k, { name: a[1], secret_enc: a[2], provider: a[3], created_at: rows.get(k)?.created_at ?? a[4], updated_at: a[4], last_used_at: rows.get(k)?.last_used_at ?? null });
      if (sql.startsWith("SELECT name")) return { results: [...rows.entries()].filter(([r]) => r.startsWith(`${a[0]}|`)).map(([, v]) => v) };
      if (sql.startsWith("SELECT secret_enc")) return { results: rows.has(k) ? [rows.get(k)] : [] };
      if (sql.startsWith("UPDATE user_env")) rows.set(k, { ...rows.get(k), secret_enc: a[2], last_used_at: a[3] });
      if (sql.startsWith("DELETE FROM user_env")) rows.delete(k);
      return { results: [] };
    },
    async run() { return this.all(); },
    async first() { return ((await this.all()).results?.[0] ?? null) as never; },
  });
  return { rows, prepare: (s: string) => stmt(s) as never, batch: async () => [] as never };
}

describe("CREDENTIALS_KEY from Secrets Store", () => {
  it("reads the binding with get() and caches it", async () => {
    resetStoreKeyCache();
    let calls = 0;
    const binding = { get: async () => { calls++; return KEY; } };
    expect((await resolveSealKeys(COOKIE, { CREDENTIALS_KEY: binding })).credentialsKey).toBe(KEY);
    expect((await resolveSealKeys(COOKIE, { CREDENTIALS_KEY: binding })).credentialsKey).toBe(KEY);
    expect(calls).toBe(1);
  });
  it("ignores an invalid store value and falls back to v1", async () => {
    resetStoreKeyCache();
    const keys = await resolveSealKeys(COOKIE, { CREDENTIALS_KEY: { get: async () => "short" } });
    expect(keys.credentialsKey).toBeUndefined();
  });
  it("retries after a failing get()", async () => {
    resetStoreKeyCache();
    expect((await resolveSealKeys(COOKIE, { CREDENTIALS_KEY: { get: async () => { throw new Error("x"); } } })).credentialsKey).toBeUndefined();
    expect((await resolveSealKeys(COOKIE, { CREDENTIALS_KEY: { get: async () => KEY } })).credentialsKey).toBe(KEY);
    resetStoreKeyCache();
  });
});

describe("Environment (Remember)", () => {
  const keys = { cookieSecret: COOKIE, credentialsKey: KEY };
  it("validates names", () => {
    expect(validEnvName("VERCEL_TOKEN")).toBe(true);
    expect(validEnvName("vercel")).toBe(false);
    expect(validEnvName("A")).toBe(false);
    expect(validEnvName("X; DROP")).toBe(false);
  });
  it("stores sealed v2, lists names and dates only, loads server-side, deletes", async () => {
    const db = fakeEnvDb();
    await saveEnv(db, keys, "u1", "VERCEL_TOKEN", "vercel-secret-value-123", "vercel", 1000);
    const row = db.rows.get("u1|VERCEL_TOKEN")!;
    expect(String(row.secret_enc).startsWith("v2.")).toBe(true);
    expect(String(row.secret_enc)).not.toContain("vercel-secret");
    const list = await listEnv(db, "u1");
    expect(list).toEqual([{ name: "VERCEL_TOKEN", provider: "vercel", createdAt: 1000, updatedAt: 1000, lastUsedAt: null }]);
    expect(JSON.stringify(list)).not.toContain("secret");
    expect(await loadEnv(db, keys, "u1", "VERCEL_TOKEN", 2000)).toBe("vercel-secret-value-123");
    expect((await listEnv(db, "u1"))[0].lastUsedAt).toBe(2000);
    expect(await loadEnv(db, keys, "u2", "VERCEL_TOKEN")).toBeNull();
    await deleteEnv(db, "u1", "VERCEL_TOKEN");
    expect(await listEnv(db, "u1")).toEqual([]);
  });
  it("is bound to user and name (a copied ciphertext does not open)", async () => {
    const db = fakeEnvDb();
    await saveEnv(db, keys, "u1", "A_TOKEN", "value-aaaaaaaa");
    db.rows.set("u2|A_TOKEN", { ...db.rows.get("u1|A_TOKEN") });
    db.rows.set("u1|B_TOKEN", { ...db.rows.get("u1|A_TOKEN") });
    expect(await loadEnv(db, keys, "u2", "A_TOKEN")).toBeNull();
    expect(await loadEnv(db, keys, "u1", "B_TOKEN")).toBeNull();
  });
  it("rejects empty values", async () => {
    await expect(saveEnv(fakeEnvDb(), keys, "u1", "A_TOKEN", "")).rejects.toThrow("invalid_value");
  });
});

describe("Create token providers", () => {
  it("lists official https pages for every provider", () => {
    const ids = TOKEN_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(["cloudflare", "github", "openai", "vercel", "huggingface"]);
    for (const p of TOKEN_PROVIDERS) {
      const u = new URL(p.url);
      expect(u.protocol).toBe("https:");
      expect(["dash.cloudflare.com", "github.com", "platform.openai.com", "vercel.com", "huggingface.co"]).toContain(u.hostname);
      expect(validEnvName(p.envName)).toBe(true);
    }
  });
});

describe("chat stream archive (R2)", () => {
  function fakeR2(): R2Like & { objects: Map<string, string> } {
    const objects = new Map<string, string>();
    return { objects, async put(k, v) { objects.set(k, v); }, async get(k) { const v = objects.get(k); return v === undefined ? null : { text: async () => v }; } };
  }
  it("merges deltas, keeps step updates, drops reasoning and quota", async () => {
    let t = 0;
    const r = createRecorder(() => ++t);
    r.record({ t: "meta", conversationId: "c1", messageId: "m1", title: "" });
    r.record({ t: "quota", messagesLeft: 3 });
    r.record({ t: "activity", a: { id: "a1", kind: "search", label: "Search", status: "running", at: 1 } });
    r.record({ t: "activity", a: { id: "r1", kind: "reasoning", label: "secret thoughts", status: "done", at: 1 } });
    r.record({ t: "delta", item: "i", text: "สวัส" });
    r.record({ t: "delta", item: "i", text: "ดี" });
    r.record({ t: "activity", a: { id: "a1", kind: "search", label: "Search", status: "done", at: 2 } });
    r.record({ t: "done", messageId: "m1" });
    const snap = r.snapshot("c1", "m1");
    expect(snap.events.map((e) => e.t)).toEqual(["meta", "activity", "delta", "done"]);
    expect(snap.events.find((e) => e.t === "delta")).toMatchObject({ text: "สวัสดี" });
    expect(snap.events.find((e) => e.t === "activity")).toMatchObject({ a: { status: "done" } });
    expect(JSON.stringify(snap)).not.toContain("secret thoughts");
    const bucket = fakeR2();
    expect(await saveArchive(bucket, "u1", snap)).toBe(true);
    expect([...bucket.objects.keys()]).toEqual([archiveKey("u1", "c1", "m1")]);
    expect((await loadArchive(bucket, "u1", "c1", "m1"))?.events.length).toBe(4);
  });
  it("never throws when the bucket is missing or failing", async () => {
    const snap = createRecorder().snapshot("c", "m");
    expect(await saveArchive(null, "u", snap)).toBe(false);
    expect(await saveArchive({ put: async () => { throw new Error("down"); }, get: async () => null }, "u", snap)).toBe(false);
  });
});
