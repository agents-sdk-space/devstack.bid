import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let mod: { prepareOpenNext(d: string, b: string | undefined): string[]; openNextInstallCmd(d: string, pm: string | null): string | null };
beforeAll(async () => { process.env.BUILD_SERVER_NO_LISTEN = "1"; mod = await import("../container/build-server.mjs"); });

const repo = (pkg: object, files: Record<string, string> = {}) => {
  const d = mkdtempSync(join(tmpdir(), "onx-"));
  writeFileSync(join(d, "package.json"), JSON.stringify(pkg));
  for (const [f, c] of Object.entries(files)) writeFileSync(join(d, f), c);
  return d;
};
const CMD = "npx opennextjs-cloudflare build";

describe("auto Cloudflare config for plain Next.js repos", () => {
  it("adds open-next.config.ts and wrangler.jsonc to a create-next-app repo", () => {
    const d = repo({ name: "My App", dependencies: { next: "15.5.30" } });
    expect(mod.prepareOpenNext(d, CMD)).toEqual(["open-next.config.ts", "wrangler.jsonc"]);
    expect(readFileSync(join(d, "open-next.config.ts"), "utf8")).toContain("defineCloudflareConfig");
    const w = JSON.parse(readFileSync(join(d, "wrangler.jsonc"), "utf8"));
    expect(w).toMatchObject({ name: "my-app", main: ".open-next/worker.js", assets: { directory: ".open-next/assets" } });
    expect(w.compatibility_flags).toContain("nodejs_compat");
  });
  it("never overwrites the repo's own config", () => {
    const d = repo({ dependencies: { next: "16.4.1" } }, { "open-next.config.ts": "MINE", "wrangler.toml": "name='x'" });
    expect(mod.prepareOpenNext(d, CMD)).toEqual([]);
    expect(readFileSync(join(d, "open-next.config.ts"), "utf8")).toBe("MINE");
    expect(existsSync(join(d, "wrangler.jsonc"))).toBe(false);
  });
  it("does nothing for non-OpenNext builds or non-Next repos", () => {
    expect(mod.prepareOpenNext(repo({ dependencies: { next: "15.5.30" } }), "npm run build")).toEqual([]);
    expect(mod.prepareOpenNext(repo({ dependencies: { vite: "7" } }), CMD)).toEqual([]);
  });
  it("installs the adapter only when it's missing, with the repo's package manager and a shell-safe command", () => {
    const d = repo({ dependencies: { next: "15.5.30" } });
    expect(mod.openNextInstallCmd(d, "npm")).toBe("npm install --no-save @opennextjs/cloudflare@1");
    expect(mod.openNextInstallCmd(d, "pnpm")).toBe("pnpm add -D @opennextjs/cloudflare@1");
    for (const pm of ["npm", "pnpm", "yarn", "bun", null]) expect(mod.openNextInstallCmd(d, pm)).toMatch(/^[\w@%+=:,./ -]{1,300}$/);
    mkdirSync(join(d, "node_modules", "@opennextjs", "cloudflare"), { recursive: true });
    writeFileSync(join(d, "node_modules", "@opennextjs", "cloudflare", "package.json"), "{}");
    expect(mod.openNextInstallCmd(d, "npm")).toBeNull();
  });
});
