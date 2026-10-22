import { describe, expect, it } from "vitest";
import { TIER_DEFAULTS, tierFor, tierLimits, limitsFor } from "@/lib/limits/tiers";
import { editableEntries, repoChanges, repoPathOk, RepoEditError, repoContext } from "@/lib/aisite/repo-turn";
import { templateBuild } from "@/lib/projects/template-seed";
import { DEPLOY_PROFILES } from "@/lib/deploy/templates";
import { TEMPLATE_PROJECTS } from "@/data/template-projects.generated";

describe("tiers", () => {
  const env = { AISITE_ADMIN_LOGINS: "Boss", DEVSTACK_PAID_LOGINS: "payer, other" };
  it("resolves tier from env lists, free by default", () => {
    expect(tierFor("boss", env)).toBe("admin");
    expect(tierFor("OTHER", env)).toBe("paid");
    expect(tierFor("rando", env)).toBe("free");
    expect(tierFor(null, env)).toBe("free");
  });
  it("free < paid < admin and env overrides", () => {
    for (const k of Object.keys(TIER_DEFAULTS.free) as (keyof typeof TIER_DEFAULTS.free)[]) {
      expect(TIER_DEFAULTS.free[k]).toBeLessThan(TIER_DEFAULTS.paid[k]);
      expect(TIER_DEFAULTS.paid[k]).toBeLessThan(TIER_DEFAULTS.admin[k]);
    }
    expect(tierLimits("free", { DEVSTACK_TIER_FREE_AI_PER_DAY: "7" }).aiPerDay).toBe(7);
    expect(tierLimits("free", { DEVSTACK_TIER_FREE_AI_PER_DAY: "-1" }).aiPerDay).toBe(20);
    expect(limitsFor("x", {}).tier).toBe("free");
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
    for (const p of [".env", "a/.env.local", ".dev.vars", "package-lock.json", "wrangler.jsonc", "open-next.config.ts", ".github/workflows/x.yml", "node_modules/a.js", ".open-next/worker.js", "out/index.html", "../x.js", "/abs.js", "img.png"]) expect(repoPathOk(p)).toBeNull();
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
