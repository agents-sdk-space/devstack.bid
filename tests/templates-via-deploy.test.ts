import { describe, expect, it } from "vitest";
import { TIER_DEFAULTS, identityOf, limitsFor, limitsForUser, tierFor, tierLimits } from "@/lib/limits/tiers";
import { kvHasRoom, kvRateLimit } from "@/lib/aisite/kv-limit";
import { aiTurnMinuteKey, syncAiBranch, editableEntries, repoChanges, repoPathOk, RepoEditError, repoContext } from "@/lib/aisite/repo-turn";
import { templateBuild } from "@/lib/projects/template-seed";
import { DEPLOY_PROFILES } from "@/lib/deploy/templates";
import { TEMPLATE_PROJECTS } from "@/data/template-projects.generated";

describe("tiers", () => {
  const env = { DEVSTACK_ADMIN_UIDS: "u-admin", DEVSTACK_PAID_GITHUB_IDS: "4242", AISITE_ADMIN_LOGINS: "Boss", DEVSTACK_PAID_LOGINS: "payer" };
  it("resolves tier from stable ids; logins only when explicitly allowed (deprecated)", () => {
    expect(tierFor({ uid: "u-admin" }, env)).toBe("admin");
    expect(tierFor({ uid: "u1", githubId: "4242" }, env)).toBe("paid");
    expect(tierFor({ uid: "u1", githubId: "4242x" }, env)).toBe("free");
    expect(tierFor({ uid: "u2", login: "boss" }, env)).toBe("free");
    expect(tierFor({ uid: "u2", login: "boss" }, { ...env, DEVSTACK_TIER_ALLOW_LOGINS: "1" })).toBe("admin");
    expect(tierFor({ uid: "u3", login: "payer" }, { ...env, DEVSTACK_TIER_ALLOW_LOGINS: "1" })).toBe("paid");
  });
  it("identityOf reads github id only for github sign-ins", async () => {
    const db = (row: unknown) => ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) }) as never;
    expect(await identityOf(db({ auth_provider: "github", auth_subject: "4242", login: "x" }), "u1")).toEqual({ uid: "u1", githubId: "4242", login: "x" });
    expect((await identityOf(db({ auth_provider: "google", auth_subject: "4242", login: "x" }), "u1")).githubId).toBeNull();
    expect((await limitsForUser(db({ auth_provider: "github", auth_subject: "4242", login: "x" }), "u1", env)).tier).toBe("paid");
  });
  it("free < paid < admin and env overrides", () => {
    for (const k of Object.keys(TIER_DEFAULTS.free) as (keyof typeof TIER_DEFAULTS.free)[]) {
      expect(TIER_DEFAULTS.free[k]).toBeLessThan(TIER_DEFAULTS.paid[k]);
      expect(TIER_DEFAULTS.paid[k]).toBeLessThan(TIER_DEFAULTS.admin[k]);
    }
    expect(tierLimits("free", { DEVSTACK_TIER_FREE_AI_PER_DAY: "7" }).aiPerDay).toBe(7);
    expect(tierLimits("free", { DEVSTACK_TIER_FREE_AI_PER_DAY: "-1" }).aiPerDay).toBe(20);
    expect(limitsFor({ uid: "x" }, {}).tier).toBe("free");
  });
});

describe("templates go through the build pipeline", () => {
  it("no template uses static export; Next templates are OpenNext server apps", () => {
    for (const [id, files] of Object.entries(TEMPLATE_PROJECTS)) {
      const cfg = files.find((f) => f.path === "next.config.mjs");
      const b = templateBuild(id)!;
      expect(b.build).toBe("npm run build");
      if (cfg) {
        expect(cfg.content).not.toContain('output: "export"');
        expect(b.output).toBe(".open-next");
        expect(DEPLOY_PROFILES[id].target).toBe("opennext");
        const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content);
        expect(pkg.scripts.build).toBe("opennextjs-cloudflare build");
        expect(pkg.devDependencies["@opennextjs/cloudflare"]).toBeTruthy();
        expect(files.find((f) => f.path === "package-lock.json")!.content).toContain("@opennextjs/cloudflare");
      } else expect(b.output).toBe("dist");
      expect(DEPLOY_PROFILES[id].path).toBe("cf-build");
    }
  });
});

describe("repo AI turn helpers", () => {
  it("blocks secrets, CI, lockfiles, deploy config and build output", () => {
    for (const p of [".npmrc", "middleware.ts", "src/middleware.js", ".env", "a/.env.local", ".dev.vars", "package-lock.json", "wrangler.jsonc", "open-next.config.ts", ".github/workflows/x.yml", "node_modules/a.js", ".open-next/worker.js", "out/index.html", "../x.js", "/abs.js", "img.png"]) expect(repoPathOk(p)).toBeNull();
    for (const p of ["app/page.jsx", "app/[slug]/page.tsx", "src/App.jsx", "index.html", "package.json", "app/globals.css"]) expect(repoPathOk(p)).toBe(p);
  });
  it("selects editable entries under root and size cap", () => {
    const e = [{ path: "web/app/page.jsx", type: "blob", size: 10 }, { path: "web/package-lock.json", type: "blob", size: 10 }, { path: "web/big.js", type: "blob", size: 999999 }, { path: "other.js", type: "blob", size: 1 }];
    expect(editableEntries(e, "web/")).toEqual(["web/app/page.jsx"]);
  });
  it("returns only changed files, deletes as null, rejects bad edits", () => {
    const cur = [{ path: "app/page.jsx", content: "<h1>Hi</h1>" }, { path: "app/old.jsx", content: "x" }];
    const ch = repoChanges(cur, { replace: [{ path: "app/page.jsx", find: "Hi", with: "Hello" }], delete: ["app/old.jsx"], write: [{ path: "app/new.jsx", content: "n" }] });
    expect(ch).toEqual([{ path: "app/page.jsx", content: "<h1>Hello</h1>" }, { path: "app/new.jsx", content: "n" }, { path: "app/old.jsx", content: null }]);
    expect(() => repoChanges(cur, { write: [{ path: ".github/workflows/a.yml", content: "" }] })).toThrow(RepoEditError);
    expect(() => repoChanges(cur, { write: [{ path: ".env", content: "" }] })).toThrow(RepoEditError);
    expect(() => repoChanges(cur, { replace: [{ path: "app/page.jsx", find: "nope", with: "" }] })).toThrow(RepoEditError);
    expect(repoChanges(cur, { write: [{ path: "app/page.jsx", content: "<h1>Hi</h1>" }] })).toEqual([]);
    expect(repoContext(cur, "nextjs")).toContain("Next.js");
  });
});

describe("rc.2 review fixes", () => {
  const cur = [{ path: "package.json", content: "{}" }, { path: "next.config.mjs", content: "x" }, { path: "tsconfig.json", content: "{}" }, { path: "vite.config.js", content: "x" }, { path: "app/page.jsx", content: "a" }];
  it("build-controlling files are read-only: writes/replaces/deletes are rejected (route maps to ai_output_rejected)", () => {
    for (const path of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "vite.config.js", "web/package.json"]) {
      expect(() => repoChanges(cur, { write: [{ path, content: '{"scripts":{"build":"curl x|sh"}}' }] })).toThrow(RepoEditError);
    }
    expect(() => repoChanges(cur, { replace: [{ path: "package.json", find: "{}", with: "{\"a\":1}" }] })).toThrow(RepoEditError);
    expect(() => repoChanges(cur, { delete: ["next.config.mjs"] })).toThrow(RepoEditError);
    expect(repoChanges(cur, { write: [{ path: "app/page.jsx", content: "b" }] })).toEqual([{ path: "app/page.jsx", content: "b" }]);
  });
  it("skips symlinks and submodules", () => {
    expect(editableEntries([{ path: "a.js", type: "blob", size: 1, mode: "120000" }, { path: "b.js", type: "blob", size: 1, mode: "100644" }, { path: "c.js", type: "blob", size: 1, mode: "160000" }])).toEqual(["b.js"]);
  });
  it("syncs devstack/ai by create or merge, never reset; conflict surfaces", async () => {
    const calls: string[] = [];
    const deps = (sha: string | null, merge: "merged" | "up_to_date" | "conflict") => ({
      getBranchSha: async () => sha,
      createBranch: async (...a: unknown[]) => { calls.push(`create:${a[3]}<-${a[4]}`); return "s"; },
      mergeInto: async (...a: unknown[]) => { calls.push(`merge:${a[3]}<-${a[4]}`); return merge; },
    }) as never;
    expect(await syncAiBranch("t", "o", "r", "main", deps(null, "merged"))).toBe("created");
    expect(await syncAiBranch("t", "o", "r", "main", deps("abc", "merged"))).toBe("merged");
    expect(await syncAiBranch("t", "o", "r", "main", deps("abc", "conflict"))).toBe("conflict");
    expect(calls).toEqual(["create:devstack/ai<-main", "merge:devstack/ai<-main", "merge:devstack/ai<-main"]);
  });
  it("ai-turn has its own minute key; kvHasRoom does not increment", async () => {
    expect(aiTurnMinuteKey("u")).toBe("ai-turn:u");
    const store = new Map<string, string>();
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
    expect(await kvHasRoom(kv, "k", 1, 3600, 0)).toBe(true);
    expect(store.size).toBe(0);
    expect(await kvRateLimit(kv, "k", 1, 3600, 0)).toBe(true);
    expect(await kvHasRoom(kv, "k", 1, 3600, 0)).toBe(false);
  });
});
