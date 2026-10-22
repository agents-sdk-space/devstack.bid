// GitHub App manifest flow: manifest contents, signed state, conversion, sealed storage, webhook secret order.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sealKeys } from "@/lib/connections/credentials";
import { appExists, buildManifest, convertManifest, isAppAdmin, loadAppBundle, manifestTarget, publicOrigin, resolveWebhookSecret, signState, storeAppBundle, verifyState, type AppBundle } from "@/lib/github/app-manifest";
import { githubManifestContentSecurityPolicy } from "@/lib/security-headers";
import { isKnownApiPath } from "@/lib/agent/api-paths";
import { readFileSync } from "node:fs";
import type { D1Like } from "@/lib/chat/store";

const keys = sealKeys("test-cookie-secret-0123456789abcdef", {});
const bundle: AppBundle = { id: 123, slug: "devstack-deploy", owner: "agents-sdk-space", html_url: "https://github.com/apps/devstack-deploy", client_id: "Iv1.x", client_secret: "cs-not-real", webhook_secret: "wh-not-real", pem: "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----" };

function fakeDb(): D1Like & { row: Record<string, unknown> | null } {
  const db = {
    row: null as Record<string, unknown> | null,
    prepare(sql: string) {
      const stmt = (args: unknown[]) => ({
        bind: (...a: unknown[]) => stmt(a),
        async first() {
          if (sql.startsWith("INSERT")) {
            if (db.row) return null;
            const [app_id, slug, owner, html_url, sealed] = args;
            db.row = { app_id, slug, owner, html_url, sealed };
            return { app_id };
          }
          return db.row;
        },
        async all() { return { results: [] }; },
        async run() { return { results: [] }; },
      });
      return stmt([]) as never;
    },
    async batch() { return []; },
  };
  return db as never;
}

describe("manifest", () => {
  const m = buildManifest(publicOrigin({}));
  it("targets prod webhook + callbacks", () => {
    expect(m.hook_attributes.url).toBe("https://devstack.bid/api/github/webhook");
    expect(m.redirect_url).toBe("https://devstack.bid/api/github/app/manifest-callback");
    expect(m.setup_url).toBe("https://devstack.bid/api/github/app/setup");
  });
  it("has the required permissions and events", () => {
    expect(m.default_permissions).toEqual({ contents: "write", metadata: "read", pull_requests: "read", statuses: "write" });
    expect(m.default_events).toEqual(["push", "pull_request"]);
  });
  it("matches docs/platform/github-app/manifest.json", () => {
    expect(JSON.parse(readFileSync("docs/platform/github-app/manifest.json", "utf8"))).toEqual(m);
  });
  it("ignores a bad PUBLIC_ORIGIN", () => expect(publicOrigin({ PUBLIC_ORIGIN: "javascript:x" })).toBe("https://devstack.bid"));
  it("org vs personal target", () => {
    expect(manifestTarget("agents-sdk-space", "s")).toBe("https://github.com/organizations/agents-sdk-space/settings/apps/new?state=s");
    expect(manifestTarget(null, "s")).toBe("https://github.com/settings/apps/new?state=s");
  });
  it("CSP lets only the manifest page post to github.com, without scripts", () => {
    const csp = githubManifestContentSecurityPolicy();
    expect(csp).toContain("form-action https://github.com");
    expect(csp).toContain("script-src 'none'");
  });
  it("routes pass the API allowlist", () => expect(isKnownApiPath("/api/github/app/manifest-callback")).toBe(true));
});

describe("state", () => {
  it("round-trips for the same user only and expires", async () => {
    const s = await signState("sec", "u1", 1000);
    expect(await verifyState("sec", "u1", s, 2000)).toBe(true);
    expect(await verifyState("sec", "u2", s, 2000)).toBe(false);
    expect(await verifyState("other", "u1", s, 2000)).toBe(false);
    expect(await verifyState("sec", "u1", s, 1000 + 11 * 60_000)).toBe(false);
    expect(await verifyState("sec", "u1", s.slice(0, -2) + "AA", 2000)).toBe(false);
    expect(await verifyState("sec", "u1", null)).toBe(false);
  });
});

describe("conversion + storage", () => {
  it("converts, stores sealed once, never overwrites", async () => {
    const f = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.github.com/app-manifests/abcdef123/conversions");
      return Response.json({ ...bundle, owner: { login: "agents-sdk-space" } });
    });
    const b = await convertManifest("abcdef123", f as never);
    expect(b).toEqual(bundle);
    const db = fakeDb();
    expect(await storeAppBundle(db, keys, b, "u1")).toBe(true);
    expect(String(db.row!.sealed)).not.toContain("wh-not-real");
    expect(String(db.row!.sealed)).not.toContain("PRIVATE KEY");
    expect(await loadAppBundle(db, keys)).toEqual(bundle);
    expect((await appExists(db))?.slug).toBe("devstack-deploy");
    expect(await storeAppBundle(db, keys, { ...b, id: 9 }, "u1")).toBe(false);
  });
  it("rejects bad codes and failed conversions", async () => {
    await expect(convertManifest("../x", fetch)).rejects.toThrow("bad_code");
    await expect(convertManifest("abcdef123", (async () => new Response("no", { status: 404 })) as never)).rejects.toThrow("conversion_failed_404");
  });
});

describe("webhook secret order", () => {
  const load = async () => bundle;
  it("app deliveries use the stored App secret", async () => expect(await resolveWebhookSecret(5, { GITHUB_APP_WEBHOOK_SECRET: "env" }, load)).toBe("wh-not-real"));
  it("per-installation override wins", async () => expect(await resolveWebhookSecret(5, { GITHUB_APP_WEBHOOK_SECRET_5: "own" }, load)).toBe("own"));
  it("repo webhooks keep the env secret", async () => expect(await resolveWebhookSecret(null, { GITHUB_APP_WEBHOOK_SECRET: "env" }, load)).toBe("env"));
  it("falls back to env before the App exists", async () => expect(await resolveWebhookSecret(5, { GITHUB_APP_WEBHOOK_SECRET: "env" }, async () => null)).toBe("env"));
});

describe("admin", () => {
  it("only listed logins", () => {
    expect(isAppAdmin("ThanabartBB", { GITHUB_APP_ADMIN_LOGINS: "thanabartbb" })).toBe(true);
    expect(isAppAdmin("someone", { GITHUB_APP_ADMIN_LOGINS: "thanabartbb" })).toBe(false);
    expect(isAppAdmin("x", {})).toBe(false);
  });
});
