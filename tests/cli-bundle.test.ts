import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundleError, buildDeployZip, buildStarterZip, isBundleSafePath } from "@/lib/deploy/bundle";
import { DEPLOY_PROFILES } from "@/lib/deploy/templates";
import { setupScript } from "@/lib/cli/setup-script";
import { deriveLimits } from "@/lib/limits/capacity";

const enc = (s: string) => new TextEncoder().encode(s);
async function open(z: Uint8Array) {
  const zip = await JSZip.loadAsync(z);
  const files = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  const read = (p: string) => zip.file(p)!.async("string");
  return { files, read };
}

const SAMPLE: Record<string, { path: string; content: string }[]> = {
  "worker-assets": [{ path: "index.html", content: "<h1>x</h1>" }, { path: "package.json", content: '{"name":"x","scripts":{"build":"vite build"}}' }],
  "worker-script": [{ path: "src/index.js", content: "export default { fetch() { return new Response('x'); } };" }],
  opennext: [{ path: "package.json", content: '{"name":"x","scripts":{"build":"next build"}}' }, { path: "next.config.mjs", content: "export default {};" }],
};

describe("deploy zip (shared by CLI and web)", () => {
  it("static starter: upstream index.html at root, wrangler assets config, deploy script, NOTICE, .assetsignore", async () => {
    const { files, read } = await open((await buildStarterZip("static", "My App")).zip);
    expect(files.sort()).toEqual(["my-app/.assetsignore", "my-app/DEPLOY.txt", "my-app/NOTICE", "my-app/index.html", "my-app/package.json", "my-app/wrangler.jsonc"]);
    const w = JSON.parse(await read("my-app/wrangler.jsonc"));
    expect(w.name).toBe("my-app");
    expect(w.assets.directory).toBe("./");
    expect(JSON.parse(await read("my-app/package.json")).scripts.deploy).toBe("wrangler deploy");
    expect(await read("my-app/index.html")).toContain("<title>my-app</title>");
    expect(await read("my-app/NOTICE")).toMatch(/cloudflare\/workers-sdk.*\n.*Cloudflare/);
  });

  it("worker starter: src/index.js + main in wrangler.jsonc", async () => {
    const z = await buildStarterZip("worker", "api");
    expect(z.filename).toBe("api-deploy.zip");
    const { files, read } = await open(z.zip);
    expect(files).toContain("api/src/index.js");
    expect(JSON.parse(await read("api/wrangler.jsonc")).main).toBe("./src/index.js");
  });

  it.each(Object.values(DEPLOY_PROFILES))("profile $id produces a valid bundle or a clear refusal", async (profile) => {
    const files = (SAMPLE[profile.target] ?? SAMPLE["worker-assets"]).map((f) => ({ path: f.path, bytes: enc(f.content) }));
    if (profile.path === "none") {
      await expect(buildDeployZip({ name: profile.id, profile, files })).rejects.toBeInstanceOf(BundleError);
      return;
    }
    const { files: out, read } = await open((await buildDeployZip({ name: profile.id, profile, files })).zip);
    const root = out[0].split("/")[0];
    expect(out).toContain(`${root}/wrangler.jsonc`);
    expect(out).toContain(`${root}/DEPLOY.txt`);
    const pkg = JSON.parse(await read(`${root}/package.json`));
    expect(pkg.scripts.deploy).toBeTruthy();
    if (profile.target === "opennext") expect(out).toContain(`${root}/open-next.config.ts`);
    const dep = await read(`${root}/DEPLOY.txt`);
    for (const s of profile.secrets) expect(dep).toContain(s);
  });

  it("never ships env/secret files", async () => {
    const files = ["index.html", ".env", ".env.local", ".dev.vars", "a/.npmrc", "node_modules/x.js", ".git/config"].map((p) => ({ path: p, bytes: enc("SECRET=1") }));
    const { files: out } = await open((await buildDeployZip({ name: "s", profile: DEPLOY_PROFILES["chat-static"], files })).zip);
    expect(out.some((p) => /\.env|\.dev\.vars|npmrc|node_modules|\.git\//.test(p))).toBe(false);
    expect(isBundleSafePath(".dev.vars.example")).toBe(true);
  });
});

describe("setup.sh", () => {
  const script = setupScript();
  it("has a short header and no guide comment lines", () => {
    const comments = script.split("\n").filter((l) => l.trim().startsWith("#"));
    expect(comments.length).toBeLessThanOrEqual(3);
    expect(script).not.toMatch(/^##/m);
  });
  it("never echoes the key and passes it to curl via stdin config", () => {
    expect(script).toContain("stty -echo");
    expect(script).toContain("curl -sS -K -");
    expect(script).not.toMatch(/echo .*\$KEY|-H "Authorization/);
  });
  it("parses with bash -n (bash 3.2-compatible syntax)", () => {
    const f = join(mkdtempSync(join(tmpdir(), "ds-")), "setup.sh");
    writeFileSync(f, script);
    execFileSync("bash", ["-n", f]);
    const sc = [`${process.env.HOME}/bin/shellcheck`, "shellcheck"].find((b) => { try { execFileSync(b, ["--version"]); return true; } catch { return false; } });
    if (sc) execFileSync(sc, ["-s", "bash", f]);
  });
});

describe("capacity limits", () => {
  it("derives defaults from platform numbers", () => {
    expect(deriveLimits({})).toMatchObject({ reposPerDay: 11, prsPerDay: 35, deploysPerDay: 100, maxFixAttempts: 3, maxFiles: 200, maxBundleBytes: 10 * 1048576, cliScaffoldsPerDay: 200, uploadsPerDay: 6 });
  });
  it("honours env overrides", () => {
    expect(deriveLimits({ DEVSTACK_LIMIT_REPOS_PER_DAY: "7" }).reposPerDay).toBe(7);
    expect(deriveLimits({ DEVSTACK_WORKERS_PLAN: "free" }).maxFiles).toBeLessThan(50);
  });
});
