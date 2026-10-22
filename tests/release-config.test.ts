import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import JSON5 from "json5";

const read = (p: string) => JSON5.parse(readFileSync(p, "utf8"));

describe("wrangler config split (hotfix vs release)", () => {
  const base = read("wrangler.jsonc");
  const rel = read("wrangler.release.jsonc");
  it("base (hotfix) config needs no Docker and has no build infra", () => {
    expect(base.containers).toBeUndefined();
    expect(base.durable_objects).toBeUndefined();
    expect(base.migrations).toBeUndefined();
    expect(base.queues).toBeUndefined();
    expect(base.r2_buckets.map((b: { binding: string }) => b.binding)).toEqual(["CHAT_STREAMS"]);
  });
  it("release config = base + build bindings", () => {
    expect(rel.name).toBe(base.name);
    expect(rel.routes).toEqual(base.routes);
    expect(rel.vars).toEqual(base.vars);
    expect(rel.r2_buckets.map((b: { binding: string }) => b.binding)).toEqual(["CHAT_STREAMS", "BUILD_ARTIFACTS", "SITES"]);
    expect(rel.containers[0]).toMatchObject({ class_name: "BuildContainer", image: "./container/Dockerfile", max_instances: 2 });
    expect(rel.durable_objects.bindings[0].name).toBe("BUILD_CONTAINER");
    expect(rel.queues.producers[0].binding).toBe("BUILD_QUEUE");
  });
  it("committed wrangler.release.jsonc is up to date", () => {
    expect(() => execFileSync("node", ["scripts/gen-release-config.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
  it("package scripts: hotfix uses base config, release uses release config", () => {
    const s = read("package.json").scripts;
    expect(s["deploy:hotfix"]).not.toContain("wrangler.release.jsonc");
    expect(s["deploy:release"]).toContain("-c wrangler.release.jsonc");
  });
});
