import { describe, expect, it, vi } from "vitest";
import { openSecret, sealSecret, sealSecretV2 } from "@/lib/auth/token-box";
import { loadCredential, loadGithubToken, open, saveCredential, seal, sealKeys, toView, validCredentialsKey, listCredentials } from "@/lib/connections/credentials";
import { validateCloudflare, validateOpenAI } from "@/lib/connections/validate";
import type { D1Like } from "@/lib/chat/store";

const COOKIE = "test-cookie-secret-at-least-32-characters";
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));

/** Tiny fake for user_credentials + github_credentials keyed by table/user/kind. */
function fakeD1(): D1Like & { rows: Map<string, Record<string, unknown>> } {
  const rows = new Map<string, Record<string, unknown>>();
  const stmt = (sql: string, a: unknown[] = []) => ({
    bind: (...x: unknown[]) => stmt(sql, x),
    async all() {
      if (sql.includes("FROM github_credentials")) return { results: rows.has(`gh|${a[0]}`) ? [rows.get(`gh|${a[0]}`)] : [] };
      if (sql.startsWith("UPDATE github_credentials")) rows.set(`gh|${a[0]}`, { ...rows.get(`gh|${a[0]}`), token_enc: a[1] });
      if (sql.startsWith("INSERT INTO user_credentials")) rows.set(`uc|${a[0]}|${a[1]}`, { kind: a[1], secret_enc: a[2], meta: a[3], verified_at: a[4] });
      if (sql.startsWith("UPDATE user_credentials")) rows.set(`uc|${a[0]}|${a[1]}`, { ...rows.get(`uc|${a[0]}|${a[1]}`), secret_enc: a[2] });
      if (sql.startsWith("SELECT kind, meta")) return { results: [...rows.entries()].filter(([k]) => k.startsWith(`uc|${a[0]}|`)).map(([, v]) => v) };
      if (sql.startsWith("SELECT secret_enc")) return { results: rows.has(`uc|${a[0]}|${a[1]}`) ? [rows.get(`uc|${a[0]}|${a[1]}`)] : [] };
      return { results: [] };
    },
    async run() { return this.all(); },
    async first() { return ((await this.all()).results?.[0] ?? null) as never; },
  });
  return { rows, prepare: (s: string) => stmt(s) as never, batch: async (s: unknown[]) => Promise.all((s as { all(): Promise<unknown> }[]).map((x) => x.all())) as never };
}

describe("CREDENTIALS_KEY v2 encryption", () => {
  const keys = { cookieSecret: COOKIE, credentialsKey: KEY };
  it("accepts only 32-byte base64 keys", () => {
    expect(validCredentialsKey(KEY)).toBe(true);
    expect(validCredentialsKey("short")).toBe(false);
    expect(sealKeys(COOKIE, { CREDENTIALS_KEY: "nope" }).credentialsKey).toBeUndefined();
  });
  it("round-trips v2 and binds to kind:user_id", async () => {
    const packed = await seal(keys, "cloudflare", "u1", "tok-secret-123456");
    expect(packed.startsWith("v2.")).toBe(true);
    expect(await open(keys, "cloudflare", "u1", packed)).toEqual({ value: "tok-secret-123456", stale: false });
    expect(await open(keys, "cloudflare", "u2", packed)).toBeNull();
    expect(await open(keys, "openai", "u1", packed)).toBeNull();
  });
  it("still opens legacy v1 and marks it stale only when a v2 key exists", async () => {
    const v1 = await sealSecret(COOKIE, "gho_legacy");
    expect(await open(keys, "github", "u1", v1)).toEqual({ value: "gho_legacy", stale: true });
    expect(await open({ cookieSecret: COOKIE }, "github", "u1", v1)).toEqual({ value: "gho_legacy", stale: false });
  });
  it("falls back to v1 sealing when CREDENTIALS_KEY is not set", async () => {
    const p = await seal({ cookieSecret: COOKIE }, "github", "u1", "x");
    expect(p.startsWith("v1.")).toBe(true);
    expect(await openSecret(COOKIE, p)).toBe("x");
  });
  it("re-seals a v1 GitHub token as v2 on first use", async () => {
    const db = fakeD1();
    db.rows.set("gh|u1", { token_enc: await sealSecret(COOKIE, "gho_abc") });
    expect(await loadGithubToken(db, keys, "u1")).toBe("gho_abc");
    expect(String(db.rows.get("gh|u1")!.token_enc).startsWith("v2.")).toBe(true);
    expect(await loadGithubToken(db, keys, "u1")).toBe("gho_abc");
  });
  it("v2 rows fail closed without the key", async () => {
    const p = await sealSecretV2(KEY, "github:u1", "t");
    expect(await open({ cookieSecret: COOKIE }, "github", "u1", p)).toBeNull();
  });
});

describe("credential views never carry secrets", () => {
  it("masks to last 4 and drops everything else", async () => {
    const db = fakeD1();
    const keys = { cookieSecret: COOKIE, credentialsKey: KEY };
    const secret = "cf_token_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789wxyz";
    await saveCredential(db, keys, "u1", "cloudflare", secret, { account_id: "a".repeat(32), label: "Acme" });
    const views = await listCredentials(db, "u1");
    const s = JSON.stringify(views);
    expect(s).not.toContain(secret);
    expect(s).not.toContain("v2.");
    expect(views[0].masked).toBe("••••wxyz");
    expect((await loadCredential(db, keys, "u1", "cloudflare"))?.secret).toBe(secret);
  });
  it("ignores junk meta", () => {
    expect(toView("openai", "not json", null)).toMatchObject({ last4: "", masked: "••••" });
  });
});

describe("provider validation before save", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const tok = "A".repeat(40);
  const acct = "0123456789abcdef0123456789abcdef";
  it("accepts an active Cloudflare token with the account", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ success: true, result: { status: "active" } })).mockResolvedValueOnce(ok({ success: true, result: { id: acct, name: "Acme" } }));
    const r = await validateCloudflare(tok, acct, f as never);
    expect(r).toMatchObject({ ok: true, meta: { account_id: acct, label: "Acme" } });
    expect(f.mock.calls[0][0]).toContain("/user/tokens/verify");
  });
  it("rejects bad format without calling the network", async () => {
    const f = vi.fn();
    expect(await validateCloudflare("x", acct, f as never)).toEqual({ ok: false, code: "invalid_format" });
    expect(f).not.toHaveBeenCalled();
  });
  it("maps account mismatch and 401", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ success: true, result: { status: "active" } })).mockResolvedValueOnce(ok({}, 403));
    expect(await validateCloudflare(tok, acct, f as never)).toEqual({ ok: false, code: "account_mismatch" });
    expect(await validateOpenAI("sk-" + "a".repeat(30), vi.fn().mockResolvedValue(ok({}, 401)) as never)).toEqual({ ok: false, code: "rejected" });
  });
});

describe("no secrets in logs", () => {
  it("connection/project/deploy code never logs tokens", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const files = ["src/lib/connections", "src/lib/deploy", "src/app/api/connections", "src/app/api/projects", "src/app/api/deployments"].flatMap((d) => { try { return walk(d); } catch { return []; } });
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/console\.\w+\([^)]*(token|secret|key\b|apiKey)/i);
  });
});
