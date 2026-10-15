import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeLog } from "@/lib/deploy/sanitize";
import { ASSETS_ENTRY, createCloudflareProvider, isAssetFile, scriptMetadata } from "@/lib/deploy/cloudflare";
import { pickProvider, providers } from "@/lib/deploy/providers";
import { DEPLOY_PROFILES } from "@/lib/deploy/templates";
import { selectFiles } from "@/lib/deploy/service";
import { LIMITS } from "@/lib/connections/policy";

const enc = (s: string) => new TextEncoder().encode(s);
const ACCT = "0123456789abcdef0123456789abcdef";

describe("sanitizeLog", () => {
  it("removes provided secrets and token-shaped strings, keeps commit SHAs", () => {
    const cf = "Zx9".repeat(15);
    const out = sanitizeLog(`auth ${cf} failed; Bearer abc.def.ghi123; ghp_${"a".repeat(36)} sk-${"b".repeat(30)} token=hunter22 sha ${"a1".repeat(20)}`, [cf]);
    expect(out).not.toContain(cf);
    expect(out).not.toMatch(/ghp_|sk-b|hunter22|abc\.def/);
    expect(out).toContain("a1".repeat(20));
  });
  it("caps length", () => {
    expect(sanitizeLog("x ".repeat(5000)).length).toBeLessThanOrEqual(4000);
  });
});

describe("provider interface", () => {
  it("picks Cloudflare only for direct profiles; Vercel is a stub", async () => {
    expect(pickProvider(DEPLOY_PROFILES["chat-static"])?.id).toBe("cloudflare");
    expect(pickProvider(DEPLOY_PROFILES["chat-worker"])?.id).toBe("cloudflare");
    expect(pickProvider(DEPLOY_PROFILES["nextjs-dashboard"])).toBeNull();
    expect(pickProvider(DEPLOY_PROFILES["express-api"])).toBeNull();
    const v = providers().vercel;
    expect(v.supports(DEPLOY_PROFILES["chat-static"])).toBe(false);
    await expect(v.deploy({} as never, async () => undefined)).rejects.toMatchObject({ code: "not_implemented" });
  });
  it("selectFiles enforces file count and size", () => {
    const many = Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => ({ path: `p${i}.html`, type: "blob", sha: "s", size: 1 }));
    expect(() => selectFiles(DEPLOY_PROFILES["chat-static"], many)).toThrow(/too_many_files/);
    expect(() => selectFiles(DEPLOY_PROFILES["chat-static"], [{ path: "index.html", type: "blob", sha: "s", size: LIMITS.maxBundleBytes + 1 }])).toThrow(/too_large/);
    expect(selectFiles(DEPLOY_PROFILES["chat-static"], [{ path: "index.html", type: "blob", sha: "s" }, { path: "README.md", type: "blob", sha: "s" }, { path: "wrangler.jsonc", type: "blob", sha: "s" }]).map((e) => e.path)).toEqual(["index.html"]);
    expect(isAssetFile(".gitignore")).toBe(false);
  });
});

describe("Cloudflare direct deploy (mocked API)", () => {
  afterEach(() => vi.restoreAllMocks());
  const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });

  it("static: upload session → bucket upload → PUT script with assets jwt → subdomain → URL", async () => {
    const seen: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.cloudflare.com/client/v4", "");
      seen.push(`${init?.method} ${path}`);
      if (path.endsWith("/assets-upload-session")) {
        const manifest = JSON.parse(String(init?.body)).manifest;
        expect(Object.keys(manifest)).toEqual(["/index.html", "/app.js"]);
        return ok({ jwt: "upload-jwt", buckets: [Object.values(manifest).map((m) => (m as { hash: string }).hash)] });
      }
      if (path.startsWith("/accounts/" + ACCT + "/workers/assets/upload")) {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer upload-jwt");
        return ok({ jwt: "completion-jwt" });
      }
      if (init?.method === "PUT") {
        const meta = JSON.parse(await ((init.body as FormData).get("metadata") as Blob).text());
        expect(meta.assets.jwt).toBe("completion-jwt");
        expect(meta.main_module).toBe("index.js");
        expect(await ((init.body as FormData).get("index.js") as Blob).text()).toBe(ASSETS_ENTRY);
        return ok({ id: "site", etag: "v1" });
      }
      if (path.endsWith("/scripts/site/subdomain")) return ok({});
      if (path.endsWith("/workers/subdomain")) return ok({ subdomain: "acme" });
      return new Response("{}", { status: 500 });
    });
    const out = await createCloudflareProvider(f as never).deploy(
      { name: "site", profile: DEPLOY_PROFILES["chat-static"], files: [{ path: "index.html", bytes: enc("<h1>hi</h1>") }, { path: "app.js", bytes: enc("1") }], credential: { secret: "t".repeat(40), meta: { account_id: ACCT } } },
      async () => undefined
    );
    expect(out).toEqual({ url: "https://site.acme.workers.dev", versionId: "v1" });
    expect(seen.filter((s) => s.startsWith("PUT"))).toHaveLength(1);
  });

  it("maps auth errors to cf_auth without leaking the token", async () => {
    const token = "SECRETTOKEN".repeat(4);
    const f = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 }));
    const p = createCloudflareProvider(f as never).deploy({ name: "w", profile: DEPLOY_PROFILES["chat-worker"], files: [{ path: "src/index.js", bytes: enc("export default {}") }], credential: { secret: token, meta: { account_id: ACCT } } }, async () => undefined);
    await expect(p).rejects.toMatchObject({ code: "cf_auth" });
    await p.catch((e) => expect(String(e.detail)).not.toContain(token));
  });

  it("worker-script metadata has no assets", () => {
    expect(scriptMetadata(DEPLOY_PROFILES["chat-worker"], "src/index.js", null)).toEqual({ main_module: "src/index.js", compatibility_date: expect.any(String), bindings: [] });
  });
});

describe("self-heal tools", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("@/lib/connections/credentials"); vi.doUnmock("@/lib/deploy/service"); vi.doUnmock("@/lib/connections/projects"); vi.doUnmock("@/lib/connections/github-service"); vi.doUnmock("@/lib/connections/audit"); });

  async function load(fixAttempts: number, status = "failed", ref = "main") {
    vi.resetModules();
    const failed = { id: "dep-12345678", project_id: "proj-12345678", user_id: "u1", status, ref, error_code: "cf_api", error_log: "SyntaxError", fix_attempts: fixAttempts, target: "cf-workers", url: null };
    const commitToBranch = vi.fn().mockResolvedValue({ sha: "c1", url: "u" });
    vi.doMock("@/lib/connections/credentials", () => ({ loadGithubToken: vi.fn().mockResolvedValue("tok") }));
    vi.doMock("@/lib/connections/audit", () => ({ audit: vi.fn() }));
    vi.doMock("@/lib/connections/github-service", () => ({ commitToBranch, createProjectRepo: vi.fn(), takeQuota: vi.fn() }));
    vi.doMock("@/lib/connections/projects", () => ({ getProject: vi.fn().mockResolvedValue({ id: "proj-12345678", repo_full_name: "me/app", default_branch: "main" }), findProjectByRepo: vi.fn(), projectView: (x: unknown) => x }));
    vi.doMock("@/lib/deploy/service", () => ({
      ERROR_HINTS: { cf_api: "hint" },
      getDeployment: vi.fn().mockResolvedValue(failed),
      latestFailed: vi.fn().mockResolvedValue(failed),
      recordFixAttempt: vi.fn().mockResolvedValue(fixAttempts >= 3 || status !== "failed" ? null : fixAttempts + 1),
      deploymentView: (d: typeof failed) => ({ id: d.id, projectId: d.project_id, ref: d.ref, status: d.status, url: d.url, errorCode: d.error_code, errorLog: d.error_log, fixAttempts: d.fix_attempts, maxFixAttempts: 3 }),
    }));
    const mod = await import("@/lib/chat/customer-tools");
    return { ...mod, commitToBranch };
  }

  it("get_deploy_logs returns the sanitized log and emits a deploy card", async () => {
    const { runCustomerTool } = await load(0);
    const events: { t: string }[] = [];
    const r = (await runCustomerTool("get_deploy_logs", {}, { db: {} as never, uid: "u1", keys: { cookieSecret: "x" }, emit: (e) => events.push(e) })) as Record<string, unknown>;
    expect(r).toMatchObject({ errorCode: "cf_api", hint: "hint", remainingFixAttempts: 3 });
    expect(events.map((e) => e.t)).toEqual(["deploy"]);
  });

  it("apply_fix commits to a fix branch (never main), shows the attempt, offers Retry — but does not redeploy", async () => {
    const { runCustomerTool, commitToBranch } = await load(1);
    const events: { t: string; a?: { label: string }; d?: { canRetry: boolean; retryRef: string; fixAttempts: number } }[] = [];
    const r = (await runCustomerTool("apply_fix", { deployment_id: "dep-12345678", message: "fix syntax", files: [{ path: "src/index.js", content: "export default {}" }] }, { db: {} as never, uid: "u1", keys: { cookieSecret: "x" }, emit: (e) => events.push(e as never) })) as Record<string, unknown>;
    expect(r).toMatchObject({ branch: "devstack/fix-dep-1234", attempt: 2, maxAttempts: 3 });
    expect(commitToBranch.mock.calls[0][1]).toMatchObject({ branch: "devstack/fix-dep-1234", defaultBranch: "main" });
    expect(events.find((e) => e.t === "activity")?.a?.label).toBe("Self-heal attempt 2/3");
    expect(events.find((e) => e.t === "deploy")?.d).toMatchObject({ canRetry: true, retryRef: "devstack/fix-dep-1234", fixAttempts: 2 });
    expect(JSON.stringify(r)).not.toMatch(/deploy\(/);
  });

  it("caps fix attempts at 3 and refuses non-failed deployments / workflow edits", async () => {
    let m = await load(3);
    const ctx = { db: {} as never, uid: "u1", keys: { cookieSecret: "x" } };
    const args = { deployment_id: "dep-12345678", message: "m", files: [{ path: "a.js", content: "1" }] };
    await expect(m.runCustomerTool("apply_fix", args, ctx)).rejects.toThrow(/Fix limit reached/);
    m = await load(0, "live");
    await expect(m.runCustomerTool("apply_fix", args, ctx)).rejects.toThrow(/Only failed/);
    m = await load(0);
    await expect(m.runCustomerTool("apply_fix", { ...args, files: [{ path: ".github/workflows/x.yml", content: "1" }] }, ctx)).rejects.toThrow(/bad_path/);
  });
});
