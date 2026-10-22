import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "ghs_FAKE_TEST_TOKEN_1234567890";
let mod: { scrubGitEnv(e: Record<string, string>): void; scrubCheckout(src: string, repo: string): void };

beforeAll(async () => {
  process.env.BUILD_SERVER_NO_LISTEN = "1";
  // @ts-expect-error plain ESM module
  mod = await import("../container/build-server.mjs");
});

describe("build container credential hygiene", () => {
  it("scrubs git env so install/build never inherit the clone token", () => {
    const env: Record<string, string> = { PATH: "/bin", GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_1: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}` };
    mod.scrubGitEnv(env);
    expect(Object.keys(env)).toEqual(["PATH"]);
  });

  it("removes token-bearing remotes, extraheaders and credential helpers from .git/config; a build step cannot read it", () => {
    const src = mkdtempSync(join(tmpdir(), "scrub-"));
    execFileSync("git", ["init", "-q", src]);
    const cfg = join(src, ".git", "config");
    writeFileSync(cfg, readFileSync(cfg, "utf8") + `[remote "origin"]\n\turl = https://x-access-token:${TOKEN}@github.com/o/r.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[http "https://github.com/"]\n\textraheader = AUTHORIZATION: basic ${TOKEN}\n[credential]\n\thelper = store\n`);
    mod.scrubCheckout(src, "o/r");
    const after = readFileSync(cfg, "utf8");
    expect(after).not.toContain(TOKEN);
    expect(after).not.toMatch(/extraheader|helper/i);
    expect(execFileSync("git", ["-C", src, "remote", "get-url", "origin"]).toString().trim()).toBe("https://github.com/o/r.git");
    // Simulated postinstall: dump env + every git config value it can see.
    mkdirSync(join(src, "x"), { recursive: true });
    const seen = execFileSync("sh", ["-c", "env; git config --list --show-origin"], { cwd: src, env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv }).toString();
    expect(seen).not.toContain(TOKEN);
  });

  it("worker entrypoint exports ContainerProxy (required by allowedHosts egress)", () => {
    expect(readFileSync(join(__dirname, "..", "custom-worker.ts"), "utf8")).toMatch(/export \{ ContainerProxy \} from "@cloudflare\/containers"/);
  });
});
