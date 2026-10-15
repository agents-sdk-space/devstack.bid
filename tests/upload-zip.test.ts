import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildStarterZip } from "@/lib/deploy/bundle";
import { parseDeployZip, scanSecrets, uploadProfile, UploadError } from "@/lib/deploy/upload";
import { cfApiBase } from "@/lib/deploy/cloudflare";

const enc = (s: string) => new TextEncoder().encode(s);
async function zipOf(files: Record<string, string>) {
  const z = new JSZip();
  for (const [p, c] of Object.entries(files)) z.file(p, c);
  return z.generateAsync({ type: "uint8array" });
}

describe("zip upload", () => {
  it("accepts the CLI/static and worker bundles as direct profiles", async () => {
    const s = await parseDeployZip((await buildStarterZip("static", "a")).zip);
    expect(s.profile.id).toBe("chat-static");
    expect(s.root).toBe("a");
    const w = await parseDeployZip((await buildStarterZip("worker", "b")).zip);
    expect(w.profile.id).toBe("chat-worker");
  });
  it("strips env files and reports them", async () => {
    const r = await parseDeployZip(await zipOf({ "x/index.html": "<h1>", "x/.env": "A=1", "x/.dev.vars": "B=2" }));
    expect(r.stripped.sort()).toEqual([".dev.vars", ".env"]);
    expect(r.files.map((f) => f.path)).toEqual(["index.html"]);
  });
  it.each([
    [{ "index.html": "x", "id_rsa": "k" }, "secret_file"],
    [{ "index.html": "-----BEGIN RSA PRIVATE KEY-----" }, "secret_content"],
    [{ "index.html": `const k = "ghp_${"a".repeat(36)}"` }, "secret_content"],
    [{ "index.html": "x", ".github/workflows/x.yml": "x" }, "bad_path"],
    [{ "package.json": '{"scripts":{"build":"vite build"}}', "index.html": "x" }, "needs_build"],
    [{ "README.md": "x" }, "not_deployable"],
  ])("rejects %j as %s", async (files, code) => {
    await expect(parseDeployZip(await zipOf(files as Record<string, string>))).rejects.toMatchObject({ code });
  });
  it("never yields a path escaping the project (zip-slip)", async () => {
    const raw = Buffer.from("UEsDBBQAAAAAABWhT10AAAAAAAAAAAAAAAAMAAAALi4vZXZpbC5odG1sUEsBAhQDFAAAAAAAFaFPXQAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAIABAAAAAC4uL2V2aWwuaHRtbFBLBQYAAAAAAQABADoAAAAqAAAAAAA=", "base64");
    try {
      const r = await parseDeployZip(new Uint8Array(raw));
      expect(r.files.every((f) => !f.path.includes(".."))).toBe(true);
    } catch (e) { expect(e).toBeInstanceOf(UploadError); }
  });
  it("rejects garbage and oversize", async () => {
    await expect(parseDeployZip(enc("not a zip"))).rejects.toBeInstanceOf(UploadError);
    await expect(parseDeployZip(new Uint8Array(11 * 1048576))).rejects.toMatchObject({ code: "too_large" });
  });
  it("profile detection ignores bundle plumbing files", () => {
    expect(uploadProfile([{ path: "index.html", bytes: enc("x") }, { path: "package.json", bytes: enc('{"devDependencies":{"wrangler":"4"}}') }]).id).toBe("chat-static");
  });
  it("secret scan is quiet on normal html", () => expect(scanSecrets("index.html", enc("<p>sk- is a prefix</p>"))).toBeNull());
  it("mock Cloudflare base only for 127.0.0.1 outside production", () => {
    expect(cfApiBase({ NODE_ENV: "production", DEVSTACK_DEV_CF_API_BASE: "http://127.0.0.1:1/client/v4" })).toBe("https://api.cloudflare.com/client/v4");
    expect(cfApiBase({ NODE_ENV: "development", DEVSTACK_DEV_CF_API_BASE: "http://evil.example/client/v4" })).toBe("https://api.cloudflare.com/client/v4");
    expect(cfApiBase({ NODE_ENV: "development", DEVSTACK_DEV_CF_API_BASE: "http://127.0.0.1:18790/client/v4" })).toBe("http://127.0.0.1:18790/client/v4");
  });
});
