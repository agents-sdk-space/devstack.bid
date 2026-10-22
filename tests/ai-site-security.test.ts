// Supdev security review of the AI builder (ef336fb): one block per finding.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sqliteD1 } from "./helpers/sqlite-d1";
import { authClearCookies, authSetCookies, HOST_AUTH_COOKIE, readAuthCookie, signUid } from "@/lib/chat/identity";
import { sameOrigin, strictOrigin } from "@/lib/auth/github-policy";
import { PREVIEW_SANDBOX, productionVersion } from "@/components/aisite/ai-site-builder";
import { injectBadge, serveSite, type R2BucketLike } from "@/lib/hosting/serve";
import { siteSlug } from "@/lib/hosting/hostnames";
import { validateSlug } from "@/lib/projects/config";
import { createAiProject, reserveAiTurn } from "@/lib/aisite/service";
import { directBlocked } from "@/lib/aisite/llm";
import { saveReport, validateReport } from "@/lib/aisite/reports";
import { isAdmin } from "@/lib/aisite/admin";
import { versionStatus, codeText } from "@/components/aisite/i18n";

const SECRET = "s".repeat(32);
const UID = "0f3a9c2e-1111-4222-8333-944455556666";

describe("1. session cookie + strict origin", () => {
  it("issues __Host- (Secure, Path=/, no Domain) and clears the legacy name", () => {
    const [c, legacy] = authSetCookies("v", true, 100);
    expect(c.startsWith(`${HOST_AUTH_COOKIE}=`)).toBe(true);
    expect(c).toMatch(/; Path=\/;/);
    expect(c).toMatch(/Secure/);
    expect(c).not.toMatch(/Domain=/i);
    expect(legacy).toMatch(/^nvx_auth=; .*Max-Age=0/);
    expect(authClearCookies(true).map((x) => x.split("=")[0])).toEqual([HOST_AUTH_COOKIE, "nvx_auth"]);
  });
  it("still reads the legacy cookie (no forced logout) and prefers __Host-", async () => {
    const v = await signUid(UID, SECRET);
    expect(await readAuthCookie(new Request("https://devstack.bid/", { headers: { cookie: `nvx_auth=${encodeURIComponent(v)}` } }), SECRET)).toBe(UID);
    expect(await readAuthCookie(new Request("https://devstack.bid/", { headers: { cookie: `nvx_auth=junk; ${HOST_AUTH_COOKIE}=${encodeURIComponent(v)}` } }), SECRET)).toBe(UID);
  });
  it("migrates legacy cookies on read, prefers __Host-, and sunsets legacy reads", async () => {
    const { legacyAuthMigration, readAuthRaw, LEGACY_AUTH_SUNSET } = await import("@/lib/chat/identity");
    const before = LEGACY_AUTH_SUNSET - 1;
    const [issue, clear] = legacyAuthMigration("nvx_auth=abc", true, before);
    expect(issue).toMatch(/^__Host-nvx_auth=abc; Path=\/; .*Secure/);
    expect(issue).not.toMatch(/Domain=/i);
    expect(clear).toMatch(/^nvx_auth=; .*Max-Age=0/);
    expect(legacyAuthMigration(`nvx_auth=tossed; ${HOST_AUTH_COOKIE}=real`, true, before)).toEqual([clear]);
    expect(legacyAuthMigration("nvx_auth=abc", true, LEGACY_AUTH_SUNSET)).toEqual([clear]);
    expect(legacyAuthMigration("nvx_auth=abc", false, before)).toEqual([]);
    expect(legacyAuthMigration(`${HOST_AUTH_COOKIE}=real`, true, before)).toEqual([]);
    expect(readAuthRaw(`nvx_auth=tossed; ${HOST_AUTH_COOKIE}=real`, before)).toBe("real");
    expect(readAuthRaw(`${HOST_AUTH_COOKIE}=real; nvx_auth=tossed`, before)).toBe("real");
    expect(readAuthRaw("nvx_auth=old", before)).toBe("old");
    expect(readAuthRaw("nvx_auth=old", LEGACY_AUTH_SUNSET)).toBeUndefined();
    expect(new Date(LEGACY_AUTH_SUNSET).toISOString()).toBe("2026-11-20T17:00:00.000Z");
  });
  it("gate writes require Origin exactly https://devstack.bid", () => {
    const r = (origin: string | null, host = "devstack.bid", site?: string) => new Request("https://devstack.bid/api/x", { method: "POST", headers: { host, ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) } });
    expect(strictOrigin(r("https://devstack.bid"))).toBe(true);
    expect(strictOrigin(r("https://evil-abc123.devstack.bid"))).toBe(false);
    expect(strictOrigin(r("https://www.devstack.bid"))).toBe(false);
    expect(strictOrigin(r(null, "devstack.bid", "same-origin"))).toBe(false);
    expect(strictOrigin(r("http://devstack.bid"))).toBe(false);
    expect(strictOrigin(r("https://devstack.bid", "x.devstack.bid"))).toBe(false);
    expect(strictOrigin(r("http://localhost:3000", "localhost:3000"))).toBe(true);
    expect(sameOrigin(r(null, "devstack.bid", "same-site"))).toBe(false);
  });
  it("no source sets Domain=.devstack.bid", async () => {
    const { execSync } = await import("node:child_process");
    expect(execSync("grep -rIl --exclude-dir=generated 'Domain=.devstack.bid\\|domain: \"\\.devstack' src || true").toString().trim()).toBe("");
  });
});

function bucket(files: Record<string, string>): R2BucketLike {
  return {
    async get(k) { const v = files[k]; return v === undefined ? null : { body: new Response(v).body!, text: async () => v, httpMetadata: { contentType: k.endsWith(".html") ? "text/html; charset=utf-8" : undefined } }; },
    async put() {},
  };
}

describe("2-3. preview sandbox, sites headers, badge, reserved slugs, reports", () => {
  it("preview sandbox has no popups or same-origin", () => {
    expect(PREVIEW_SANDBOX).toBe("allow-scripts allow-forms");
  });
  it("sites worker sends frame-ancestors + nosniff and injects the report badge into HTML only", async () => {
    const b = bucket({ "hosts/cafe.json": JSON.stringify({ deploymentId: "dep-00000001" }), "sites/dep-00000001/index.html": "<html><body><h1>x</h1></body></html>", "sites/dep-00000001/a.js": "1" });
    const res = await serveSite(new Request("https://cafe.devstack.bid/"), b);
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors https://devstack.bid");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await res.text();
    expect(html).toMatch(/Built by a devstack\.bid user · Report<\/a><\/body>/);
    expect(html).toContain("https://devstack.bid/report?site=cafe.devstack.bid");
    expect(await (await serveSite(new Request("https://cafe.devstack.bid/a.js"), b)).text()).toBe("1");
    expect(injectBadge("plain", 'x"><script>')).not.toContain("<script>");
  });
  it("reserves platform-like slugs", () => {
    for (const s of ["login", "auth", "admin", "www", "api", "app", "mail", "support", "billing", "signin", "devstack-login", "my-github"]) {
      expect(siteSlug(s)).toBeNull();
      expect(validateSlug(s).ok).toBe(false);
    }
    expect(siteSlug("coffee-shop")).toBe("coffee-shop");
  });
  it("stores real reports for user sites only", async () => {
    const db = sqliteD1();
    expect(validateReport({ site: "devstack.bid", reason: "spam" })).toBeNull();
    expect(validateReport({ site: "cafe.devstack.bid", reason: "nope" })).toBeNull();
    const r = validateReport({ site: "cafe.devstack.bid", reason: "phishing", details: "fake login" })!;
    const id = await saveReport(db, r, "1.2.3.4", "salt");
    const row = db.raw.prepare("SELECT host, reason, details, ip_hash FROM site_reports WHERE id = ?").get(id) as Record<string, string>;
    expect(row).toMatchObject({ host: "cafe.devstack.bid", reason: "phishing", details: "fake login" });
    expect(row.ip_hash).not.toContain("1.2.3.4");
  });
});

describe("4. atomic daily quota", () => {
  it("never exceeds the cap even with concurrent reservations", async () => {
    const db = sqliteD1();
    db.raw.exec("INSERT INTO users (id) VALUES ('u1')");
    const res = await Promise.all(Array.from({ length: 8 }, () => reserveAiTurn(db, "u1", 5)));
    expect(res.filter(Boolean).length).toBe(5);
    expect(await reserveAiTurn(db, "u1", 5)).toBe(false);
    expect(await reserveAiTurn(db, "u1", 5, Date.now() + 86_400_001)).toBe(true);
  });
});

describe("5. fail closed without AI Gateway in production", () => {
  it("blocks direct unless AISITE_ALLOW_DIRECT", () => {
    const gw = { accountId: "a".repeat(32), gatewayId: "g" };
    expect(directBlocked({}, true, false)).toBe(true);
    expect(directBlocked({}, true, true)).toBe(false);
    expect(directBlocked({}, false, false)).toBe(false);
    expect(directBlocked(gw, true, false)).toBe(false);
    expect(codeText("en", "ai_gateway_required", undefined)).toMatch(/Blocked/);
  });
});

describe("6. globally unique slugs", () => {
  it("migration 0017 dedupes existing slugs and the index + createAiProject handle conflicts", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { readdirSync, readFileSync } = await import("node:fs");
    const raw = new DatabaseSync(":memory:");
    const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
    for (const f of files.filter((f) => f < "0017")) raw.exec(readFileSync(`migrations/${f}`, "utf8"));
    // 'dup-p2bbbb' is exactly what the old 6-char suffix scheme would have produced for p2bbbbbb -> must not collide.
    raw.exec("INSERT INTO users (id) VALUES ('a'),('b'),('c'); INSERT INTO projects (id, user_id, name, slug) VALUES ('p1aaaaaa','a','x','dup'),('p2bbbbbb','b','x','dup'),('p4dddddd','a','x','dup-p2bbbb'),('p5eeeeee','c','x','dup')");
    raw.exec(readFileSync("migrations/0017_site_safety.sql", "utf8"));
    expect(raw.prepare("SELECT slug FROM projects ORDER BY id").all().map((r) => (r as { slug: string }).slug)).toEqual(["dup", "dup-p2bbbbbb", "dup-p2bbbb", "dup-p5eeeeee"]);
    expect(() => raw.exec("INSERT INTO projects (id, user_id, name, slug) VALUES ('p3','a','x','dup')")).toThrow(/UNIQUE/);

    const db = sqliteD1();
    db.raw.exec("INSERT INTO users (id) VALUES ('u1'),('u2')");
    const a = await createAiProject(db, "u1", "Cafe");
    const b = await createAiProject(db, "u2", "Cafe");
    expect(a.slug).toBe("cafe");
    expect(b.slug).not.toBe("cafe");
    // Same slug gate as import: an R2 host record / tombstone of another project and preview-shaped names are skipped.
    const sites = { get: async (k: string) => (k === "hosts/tea.json" ? { text: async () => JSON.stringify({ projectId: null, expired: true }) } : null), put: async () => undefined } as never;
    const t = await createAiProject(db, "u1", "Tea", sites);
    expect(t.slug).toBe("tea-2");
  });
});

describe("UX helpers (Subdev review)", () => {
  it("separates pending, in-progress, dns-blocked and real blocked states with reasons", () => {
    const i = { sites: true, dnsReady: false };
    expect(versionStatus({ deploy_status: null, error_log: null }, i).key).toBe("st.pending");
    expect(versionStatus({ deploy_status: null, error_log: null }, { ...i, sites: false })).toEqual({ key: "st.blocked", why: "why.sites" });
    expect(versionStatus({ deploy_status: "live", error_log: null }, i)).toEqual({ key: "st.dnsBlocked", why: "why.dns" });
    expect(versionStatus({ deploy_status: "live", error_log: null }, { ...i, dnsReady: true }).key).toBe("st.live");
    expect(versionStatus({ deploy_status: "queued", error_log: null }, i).key).toBe("st.queued");
    expect(versionStatus({ deploy_status: "failed", error_log: "boom" }, i)).toEqual({ key: "st.failed", detail: "boom" });
  });
  it("marks one production version, translates codes, hides AI route from non-admins", () => {
    expect(productionVersion([{ version: 3, alias_url: null }, { version: 2, alias_url: "https://x.devstack.bid" }])).toBe(2);
    expect(codeText("th", "daily_limit", "x")).toBe("ครบโควตา AI วันนี้แล้ว ลองใหม่พรุ่งนี้");
    expect(codeText("en", "unknown_code", "server msg")).toBe("server msg");
    expect(isAdmin("alice", "")).toBe(false);
    expect(isAdmin("Alice", "bob, alice")).toBe(true);
  });
});
