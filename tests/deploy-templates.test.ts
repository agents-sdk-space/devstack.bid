import { describe, expect, it } from "vitest";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import { DEPLOY_PROFILES, deployButtonUrl, deployConfigFiles, detectProfile, openNextPackagePatch, resolveProfile } from "@/lib/deploy/templates";
import { readFileSync } from "node:fs";

describe("deploy mapping table", () => {
  it("covers every Stack Template, Studio and the sandbox example", () => {
    for (const id of KNOWN_TEMPLATE_IDS) expect(DEPLOY_PROFILES[id], id).toBeTruthy();
    expect(DEPLOY_PROFILES.studio).toBeTruthy();
    expect(DEPLOY_PROFILES["my-button"].path).toBe("none");
  });
  it("is consistent: target ↔ path ↔ build", () => {
    for (const p of Object.values(DEPLOY_PROFILES)) {
      if (p.target === "not-deployable") expect(p.path, p.id).toBe("none");
      if (p.path === "direct") expect(p.build, p.id).toBeNull();
      if (p.path === "cf-build") expect(p.build, p.id).toBeTruthy();
      if (p.target === "opennext") expect(p.entry).toBe(".open-next/worker.js");
    }
  });
  it("maps the expected targets", () => {
    expect(DEPLOY_PROFILES["nextjs-dashboard"].target).toBe("opennext");
    expect(DEPLOY_PROFILES["vite-react-game"].target).toBe("worker-assets");
    expect(DEPLOY_PROFILES["express-api"].target).toBe("not-deployable");
    expect(DEPLOY_PROFILES["collab-workspace"].flags.join(" ")).toMatch(/BREAKS/);
    expect(DEPLOY_PROFILES.studio.flags.join(" ")).toMatch(/Pages/);
  });
  it("documents every profile in docs/deploy-templates.md", () => {
    const doc = readFileSync("docs/deploy-templates.md", "utf8");
    for (const id of Object.keys(DEPLOY_PROFILES)) expect(doc, id).toContain(`\`${id}\``);
  });
});

describe("detection and config files", () => {
  it("detects chat-generated projects", () => {
    expect(detectProfile(["index.html", "style.css"]).id).toBe("chat-static");
    expect(detectProfile(["src/index.js"]).id).toBe("chat-worker");
    expect(detectProfile(["package.json", "next.config.ts"]).target).toBe("opennext");
    expect(detectProfile(["package.json", "vite.config.ts"]).target).toBe("worker-assets");
    expect(detectProfile(["README.md"]).path).toBe("none");
    expect(resolveProfile("vite-react-game", ["index.html"]).id).toBe("vite-react-game");
  });
  it("writes Workers (not Pages) config", () => {
    const [w] = deployConfigFiles(DEPLOY_PROFILES.studio, "my-app");
    const cfg = JSON.parse(w.content);
    expect(w.path).toBe("wrangler.jsonc");
    expect(cfg.assets).toEqual({ directory: "./dist", not_found_handling: "single-page-application" });
    expect(cfg).not.toHaveProperty("pages_build_output_dir");
    const next = deployConfigFiles(DEPLOY_PROFILES["nextjs-ai-chat"], "chat");
    expect(next.map((f) => f.path)).toEqual(["wrangler.jsonc", "open-next.config.ts", ".dev.vars.example"]);
    expect(JSON.parse(next[0].content).main).toBe(".open-next/worker.js");
    expect(deployConfigFiles(DEPLOY_PROFILES["express-api"], "x")).toEqual([]);
    expect(openNextPackagePatch({ scripts: { dev: "next dev" } })).toMatchObject({ scripts: { dev: "next dev", deploy: expect.stringContaining("opennextjs-cloudflare deploy") } });
    expect(deployButtonUrl("me/app")).toBe("https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fme%2Fapp");
  });
});
