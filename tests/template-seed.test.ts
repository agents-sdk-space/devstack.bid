import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/data/templates";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import { chooseTemplate } from "@/lib/ai/fallback";
import { validateChangeSet } from "@/lib/connections/policy";
import { profileById } from "@/lib/deploy/templates";
import { isSeedSecretPath, safeText, templateBuild, templateSeedFiles } from "@/lib/projects/template-seed";
import { BANNED_HUES, pickHue, websiteTheme } from "@/lib/projects/website-theme";

/** The templates offered on /new (same filter as src/app/new/page.tsx). */
const NEW_IDS = TEMPLATES.filter((t) => (profileById(t.id)?.path ?? "none") !== "none").map((t) => t.id);

describe("/new templates commit complete, buildable projects", () => {
  it("offers the 5 original web templates plus the website template", () => {
    expect(NEW_IDS.sort()).toEqual(["collab-workspace", "nextjs-ai-chat", "nextjs-dashboard", "react-admin-tool", "static-website", "vite-react-game"]);
  });

  it.each(NEW_IDS)("%s has package.json, a lockfile, a build script and pinned versions", (id) => {
    const files = templateSeedFiles(id, "demo-app", "A demo");
    const get = (p: string) => files.find((f) => f.path === p)?.content;
    const pkg = JSON.parse(get("package.json")!);
    expect(pkg.name).toBe("demo-app");
    expect(pkg.scripts.build).toBeTruthy();
    for (const v of Object.values({ ...pkg.dependencies, ...pkg.devDependencies }) as string[]) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    const lock = JSON.parse(get("package-lock.json")!);
    expect(lock.name).toBe("demo-app");
    expect(lock.packages[""].name).toBe("demo-app");
    expect(validateChangeSet(files).ok).toBe(true);
    expect(files.some((f) => /__[A-Z_]+__/.test(f.content ?? ""))).toBe(false);
    const b = templateBuild(id)!;
    expect(b.framework === "nextjs" ? `${b.output}/assets` : b.output).toBe(profileById(id)!.assetsDir);
    if (b.framework === "nextjs") { expect(get("next.config.mjs")).not.toContain('output: "export"'); expect(get("open-next.config.ts")).toContain("defineCloudflareConfig"); }
    expect(files.some((f) => /^(app|pages)\/api\//.test(f.path) || /\.env(\.local)?$/.test(f.path))).toBe(false);
  });

  it("yields distinct output per template (no shared default)", () => {
    const sigs = KNOWN_TEMPLATE_IDS.map((id) => JSON.stringify(templateSeedFiles(id, "demo").filter((f) => f.path !== "README.md")));
    expect(new Set(sigs).size).toBe(KNOWN_TEMPLATE_IDS.length);
  });

  it("never falls back to the first template for an unknown id", () => {
    expect(templateSeedFiles("nope", "demo")).toEqual([]);
    expect(templateBuild("nope")).toBeNull();
  });

  it("generated module is in sync with template-projects/", () => {
    expect(() => execFileSync(process.execPath, ["scripts/gen-template-projects.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("strips characters that could break out of HTML/JSX/JS", () => {
    expect(safeText(`a<script>"x"{y}\`$z\\`, 100)).toBe("a script x y z");
    const f = templateSeedFiles("static-website", "x", `</title><script>alert(1)</script>`);
    expect(f.find((x) => x.path === "index.html")!.content).not.toContain("<script>alert");
  });
});

describe("secret files are never seeded", () => {
  it.each([".env", ".env.local", ".env.production", ".env.development", ".dev.vars", "app/.env.production", "sub/.dev.vars"])("%s is excluded", (p) => expect(isSeedSecretPath(p)).toBe(true));
  it.each([".env.example", "app/.env.example", "env.ts", ".envrc.md", "README.md"])("%s is allowed", (p) => expect(isSeedSecretPath(p)).toBe(false));
  it("no template seeds any secret file", () => {
    for (const id of KNOWN_TEMPLATE_IDS) expect(templateSeedFiles(id, "demo").filter((f) => isSeedSecretPath(f.path)), id).toEqual([]);
  });
});

describe("website template design", () => {
  it("never picks an indigo/violet/purple hue", () => {
    for (let n = 0; n < 5000; n++) {
      const h = pickHue(n * 7919);
      expect(h >= BANNED_HUES[0] && h <= BANNED_HUES[1]).toBe(false);
    }
  });
  it("varies with the project name and description", () => {
    const names = ["bean-there-cafe", "smile-dental", "green-school", "my-blog", "noodle-house", "fit-gym", "lens-portfolio", "sunrise-hotel"];
    const themes = names.map((n) => websiteTheme(n, "desc"));
    expect(new Set(themes.map((t) => t.primary)).size).toBeGreaterThanOrEqual(6);
    expect(websiteTheme("a", "one").primary).not.toBe(websiteTheme("a", "two").primary);
    const css = (n: string) => templateSeedFiles("static-website", n, "x").find((f) => f.path === "public/style.css")!.content;
    expect(css("bean-there-cafe")).not.toBe(css("smile-dental"));
  });
});

describe("rule-based picker routing", () => {
  it.each([
    // general websites, Thai + English
    ["ทำเว็บร้านกาแฟ", "static-website"], ["coffee shop website", "static-website"],
    ["landing page for a dentist", "static-website"], ["เว็บไซต์คลินิกทันตกรรม", "static-website"],
    ["บล็อกส่วนตัว", "static-website"], ["personal blog", "static-website"],
    ["เว็บโรงเรียน", "static-website"], ["school website", "static-website"],
    ["portfolio ช่างภาพ", "static-website"], ["ร้านอาหารญี่ปุ่น", "static-website"], ["restaurant", "static-website"],
    ["something nice", "static-website"],
    // business words lose to app-type words
    ["clinic dashboard", "nextjs-dashboard"], ["dentist clinic dashboard", "nextjs-dashboard"],
    ["shop admin", "react-admin-tool"], ["coffee shop admin", "react-admin-tool"],
    ["เว็บแอป AI", "nextjs-ai-chat"], ["dashboard ยอดขาย", "nextjs-dashboard"],
    // other templates unchanged
    ["analytics dashboard with charts", "nextjs-dashboard"], ["เกมงู", "vite-react-game"], ["REST API ด้วย express", "express-api"],
    ["python fastapi", "fastapi-ai"], ["cli tool npx", "node-cli-npx"], ["realtime collab doc", "collab-workspace"],
  ])("%s -> %s", (prompt, id) => expect(chooseTemplate(prompt).id).toBe(id));

  it("is independent of TEMPLATES order", () => {
    const prompts = ["clinic dashboard", "เว็บแอป AI", "coffee shop admin", "ทำเว็บร้านกาแฟ", "admin", "chat"];
    const before = prompts.map((p) => chooseTemplate(p).id);
    TEMPLATES.reverse();
    try { expect(prompts.map((p) => chooseTemplate(p).id)).toEqual(before); } finally { TEMPLATES.reverse(); }
  });
});

// Real install + build like the build container (npm ci, npm run build, index.html in the output dir).
// Network + ~1 min, so opt-in: RUN_TEMPLATE_BUILDS=1 npx vitest run tests/template-seed.test.ts
describe.runIf(process.env.RUN_TEMPLATE_BUILDS === "1")("real builds", () => {
  it.each(NEW_IDS)("%s builds to static output with index.html", (id) => {
    const dir = mkdtempSync(join(tmpdir(), `tpl-${id}-`));
    try {
      for (const f of templateSeedFiles(id, `${id}-site`, "Build check")) { mkdirSync(dirname(join(dir, f.path)), { recursive: true }); writeFileSync(join(dir, f.path), f.content!); }
      const env = { PATH: process.env.PATH, HOME: dir, CI: "1", NEXT_TELEMETRY_DISABLED: "1" } as unknown as NodeJS.ProcessEnv;
      execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir, env: { ...env, NODE_ENV: "development" }, stdio: "pipe" });
      execFileSync("npm", ["run", "build"], { cwd: dir, env: { ...env, NODE_ENV: "production" }, stdio: "pipe" });
      expect(existsSync(join(dir, templateBuild(id)!.output, "index.html"))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 300_000);
});
