// Milestone 2: container build executor (Queue consumer body), caps, redaction, cancel, Blocked infra.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { claimWithCap, MAX_CONCURRENT_BUILDS } from "@/lib/build/caps";
import { missingInfra, runContainerJob, startContainerBuild, type BuildBindings, type ContainerStub } from "@/lib/build/executor";
import { createBuildJob, createLogStream } from "@/lib/build/jobs";
import { readTar } from "@/lib/build/tar";
import { sealKeys, seal } from "@/lib/connections/credentials";
import { sanitizeLog, secretForms } from "@/lib/deploy/sanitize";
import { serveSite, type R2BucketLike } from "@/lib/hosting/serve";
import { sqliteD1 } from "./helpers/sqlite-d1";

const SHA = "5b3da65ea310f98480c5258af97ff4d5c6f9d5b0";
const keys = sealKeys("test-cookie-secret-0123456789abcdef", {});

function memBucket(): R2BucketLike & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    async get(k) { const v = map.get(k); return v ? { body: new Response(v as BlobPart).body!, text: async () => new TextDecoder().decode(v) } : null; },
    async put(k, v) { map.set(k, typeof v === "string" ? new TextEncoder().encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v as ArrayBuffer)); },
  };
}

function tarOf(files: Record<string, string>): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = new TextEncoder().encode(content);
    const h = new Uint8Array(512);
    h.set(new TextEncoder().encode(name), 0);
    h.set(new TextEncoder().encode(data.length.toString(8).padStart(11, "0")), 124);
    h[156] = 48;
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}

async function setup(opts: { privateRepo?: boolean; token?: string } = {}) {
  const db = sqliteD1();
  db.raw.exec(`INSERT INTO users (id) VALUES ('userA'); INSERT INTO projects (id, user_id, name, repo_full_name, default_branch, slug, output_directory) VALUES ('projA-0001', 'userA', 'Svelte App', 'sveltejs/template', 'master', 'svelte-app', 'public');
    INSERT INTO project_connections (id, project_id, user_id, provider, repo_full_name, private) VALUES ('c1', 'projA-0001', 'userA', 'github', 'sveltejs/template', ${opts.privateRepo ? 1 : 0});`);
  if (opts.token) db.raw.prepare("INSERT INTO github_credentials (user_id, token_enc, scope) VALUES (?, ?, 'repo')").run("userA", await seal(keys, "github", "userA", opts.token));
  return db;
}

async function queued(db: ReturnType<typeof sqliteD1>, env: "preview" | "production" = "production") {
  const { job } = await createBuildJob(db, { projectId: "projA-0001", userId: "userA", executor: "cf-container", environment: env, commitSha: SHA, ref: "master", maxAttempts: 1, config: { root: "", install: null, build: null, output: "public", node: null, slug: "svelte-app" } });
  db.raw.prepare("INSERT INTO deployments (id, project_id, user_id, ref, commit_sha, target, status, build_job_id, environment) VALUES (?, 'projA-0001', 'userA', 'master', ?, 'devstack-sites', 'queued', ?, ?)").run(`dep-${job.id}`, SHA, job.id, env);
  return job;
}

function scripted(lines: object[], tar?: Uint8Array): ContainerStub & { bodies: string[] } {
  const bodies: string[] = [];
  return {
    bodies,
    async fetch(url, init) {
      if (url.endsWith("/build")) {
        bodies.push(String(init?.body));
        const enc = new TextEncoder();
        return new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc.encode(JSON.stringify(l) + "\n")); c.close(); } }));
      }
      if (url.endsWith("/artifact")) return tar ? new Response(tar as BlobPart) : new Response(null, { status: 404 });
      return new Response("ok");
    },
    async stop() {},
  };
}

function bindings(box: ContainerStub | null, extra: Partial<BuildBindings> = {}): BuildBindings & { sent: unknown[]; sites: ReturnType<typeof memBucket>; artifacts: ReturnType<typeof memBucket> } {
  const sent: unknown[] = [];
  return { queue: { send: async (b: unknown) => { sent.push(b); } }, artifacts: memBucket(), sites: memBucket(), container: box ? () => box : null, dnsReady: false, sent, ...extra } as never;
}

const events = (db: ReturnType<typeof sqliteD1>, id: string) => db.raw.prepare("SELECT level, phase, message FROM build_events WHERE build_job_id = ? ORDER BY seq").all(id) as { level: string; phase: string; message: string }[];

describe("build executor", () => {
  it("reports missing infrastructure as Blocked (no job, no fake success)", async () => {
    const db = await setup({ token: "gho_" + "a".repeat(36) });
    expect(missingInfra(null)).toEqual(["Queue BUILD_QUEUE", "R2 BUILD_ARTIFACTS", "R2 SITES", "Container BUILD_CONTAINER"]);
    const p = db.raw.prepare("SELECT * FROM projects WHERE id = 'projA-0001'").get() as never;
    await expect(startContainerBuild(db, keys, bindings(null, { queue: null }), "userA", p)).rejects.toMatchObject({ code: "blocked", status: 503 });
    expect(db.raw.prepare("SELECT COUNT(*) n FROM build_jobs").get()).toEqual({ n: 0 });
  });

  it("enqueues on import-style start, with daily cap and commit pinning", async () => {
    const db = await setup({ token: "gho_" + "a".repeat(36) });
    const p = db.raw.prepare("SELECT * FROM projects WHERE id = 'projA-0001'").get() as never;
    const b = bindings(scripted([]));
    const r = await startContainerBuild(db, keys, b, "userA", p, {}, async () => SHA);
    expect(r.job.status).toBe("queued");
    expect(r.job.commit_sha).toBe(SHA);
    expect(r.productionUrl).toBe("https://svelte-app.devstack.bid");
    expect(r.previewUrl).toMatch(/^https:\/\/svelte-app-[a-z0-9]{6}\.devstack\.bid$/);
    expect(b.sent).toEqual([{ jobId: r.job.id }]);
    expect(r.job.config_snapshot).not.toMatch(/gho_/);
  });

  it("runs a build: phases, redacted streamed logs (split secrets), R2 artifact + site, Blocked URL until DNS", async () => {
    const token = "gho_" + "Z".repeat(36);
    const db = await setup({ token });
    db.raw.prepare("INSERT INTO environment_variables (id, project_id, user_id, environment, key, value_enc) VALUES ('e1', 'projA-0001', 'userA', 'production', 'API_SECRET', ?)").run(await seal(keys, "env:projA-0001", "userA", "s3cr3t-value-XYZ"));
    const job = await queued(db);
    const box = scripted([
      { t: "phase", phase: "installing" }, { t: "log", phase: "installing", chunk: "token is gho_ZZZZZZZZZZZZZZZZ" }, { t: "log", phase: "installing", chunk: "ZZZZZZZZZZZZZZZZZZZZ ok\n" },
      { t: "phase", phase: "building" }, { t: "log", phase: "building", chunk: "env s3cr3t-val" }, { t: "log", phase: "building", chunk: "ue-XYZ and " + encodeURIComponent("s3cr3t-value-XYZ") + "\n" },
      { t: "phase", phase: "uploading" }, { t: "result", ok: true },
    ], tarOf({ "./index.html": "<h1>svelte</h1>", "./build/bundle.js": "x" }));
    const b = bindings(box);
    expect(await runContainerJob(db, keys, b, job.id)).toBe("done");
    const j = db.raw.prepare("SELECT status, artifact_key FROM build_jobs WHERE id = ?").get(job.id) as { status: string; artifact_key: string };
    expect(j).toEqual({ status: "succeeded", artifact_key: `artifacts/${job.id}.tar` });
    const all = events(db, job.id).map((e) => e.message).join("\n");
    expect(all).not.toContain("ZZZZZZZZ");
    expect(all).not.toContain("s3cr3t");
    expect(events(db, job.id).map((e) => e.phase)).toEqual(expect.arrayContaining(["installing", "building", "uploading"]));
    expect(JSON.parse(box.bodies[0]).token).toBe(token); // only in the container request body
    expect(new TextDecoder().decode(b.artifacts.map.get(`logs/${job.id}.txt`)!)).not.toContain("s3cr3t");
    const dep = db.raw.prepare("SELECT status, url, error_code, alias_url FROM deployments WHERE build_job_id = ?").get(job.id) as Record<string, string>;
    expect(dep).toMatchObject({ status: "failed", url: null, error_code: "site_url_blocked", alias_url: "https://svelte-app.devstack.bid" });
    const res = await serveSite(new Request("https://svelte-app.devstack.bid/"), b.sites);
    expect(await res.text()).toBe("<h1>svelte</h1>");
  });

  it("marks live with a URL only when DNS is ready", async () => {
    const db = await setup();
    const job = await queued(db, "preview");
    const b = bindings(scripted([{ t: "phase", phase: "uploading" }, { t: "result", ok: true }], tarOf({ "index.html": "ok" })), { dnsReady: true });
    await runContainerJob(db, keys, b, job.id);
    const dep = db.raw.prepare("SELECT status, url FROM deployments WHERE build_job_id = ?").get(job.id) as { status: string; url: string };
    expect(dep.status).toBe("live");
    expect(dep.url).toMatch(/^https:\/\/svelte-app-[a-z0-9]{6}\.devstack\.bid$/);
  });

  it("fails private repos without a GitHub connection, and build failures keep their code", async () => {
    const db = await setup({ privateRepo: true });
    const j1 = await queued(db);
    await runContainerJob(db, keys, bindings(scripted([])), j1.id);
    expect(db.raw.prepare("SELECT status, error_code FROM build_jobs WHERE id = ?").get(j1.id)).toEqual({ status: "failed", error_code: "invalid_config" });
    const db2 = await setup();
    const j2 = await queued(db2);
    await runContainerJob(db2, keys, bindings(scripted([{ t: "phase", phase: "installing" }, { t: "phase", phase: "building" }, { t: "result", ok: false, code: "build_failed", message: "build exited with 1" }])), j2.id);
    expect(db2.raw.prepare("SELECT status, error_code FROM build_jobs WHERE id = ?").get(j2.id)).toEqual({ status: "failed", error_code: "build_failed" });
  });

  it("honours cancel requested before the container reports progress", async () => {
    const db = await setup();
    const job = await queued(db);
    db.raw.prepare("UPDATE build_jobs SET cancel_requested = 1 WHERE id = ?").run(job.id);
    expect(await runContainerJob(db, keys, bindings(scripted([])), job.id)).toBe("done");
    expect(db.raw.prepare("SELECT status FROM build_jobs WHERE id = ?").get(job.id)).toEqual({ status: "canceled" });
    expect(db.raw.prepare("SELECT status, error_code FROM deployments WHERE build_job_id = ?").get(job.id)).toEqual({ status: "failed", error_code: "canceled" });
  });

  it("caps concurrent builds at 2 and skips redelivered messages", async () => {
    const db = await setup();
    db.raw.exec("INSERT INTO projects (id, user_id, name) VALUES ('p2', 'userA', 'b'), ('p3', 'userA', 'c')");
    const ids: string[] = [];
    for (const pid of ["projA-0001", "p2", "p3"]) ids.push((await createBuildJob(db, { projectId: pid, userId: "userA", executor: "cf-container", commitSha: SHA })).job.id);
    expect(MAX_CONCURRENT_BUILDS).toBe(2);
    expect(await claimWithCap(db, ids[0])).toBe(true);
    expect(await claimWithCap(db, ids[1])).toBe(true);
    expect(await claimWithCap(db, ids[2])).toBe(false);
    expect(await runContainerJob(db, keys, bindings(scripted([])), ids[0])).toBe("skipped");
  });
});

describe("log redaction", () => {
  it("line-buffers chunks and redacts encoded forms longest-first; warns on short secrets", async () => {
    const out: string[] = [];
    const s = createLogStream(async (l) => { out.push(`${l.level}:${l.message}`); }, { secrets: ["abc", "longsecret-123456", "longsecret-123"] });
    await s.write("pre longsecret-12");
    await s.write("3456 mid " + btoa("longsecret-123456") + "\npartial");
    await s.flush();
    expect(out[0]).toMatch(/^warn:1 environment value/);
    expect(out.join("\n")).not.toMatch(/longsecret|bG9uZ3NlY3JldC0xMjM0NTY/);
    expect(out.join("\n")).toContain("partial");
    expect(secretForms("a/b+c=d?")).toContain(encodeURIComponent("a/b+c=d?"));
    for (const t of ["ghp_", "gho_", "ghs_", "ghu_"]) expect(sanitizeLog(`x ${t}${"A".repeat(36)} y`)).toBe("x [redacted] y");
    expect(sanitizeLog(`github_pat_${"B".repeat(40)}`)).toBe("[redacted]");
  });

  it("reads tar files safely", () => {
    const files = readTar(tarOf({ "./a.txt": "A", "../evil": "x", "/abs": "y" }));
    expect(files.map((f) => f.path)).toEqual(["a.txt"]);
  });
});

// Real end-to-end: the container's build server (run locally, no Docker) clones a small public repo
// at a pinned commit, installs, builds, and the executor publishes the output. Needs network: E2E_BUILD=1.
describe.runIf(process.env.E2E_BUILD === "1")("e2e: real build of sveltejs/template", () => {
  it("clones, installs, builds and serves the site", async () => {
    const work = mkdtempSync(join(tmpdir(), "dsb-"));
    const port = 18000 + Math.floor(Math.random() * 1000);
    const srv: ChildProcess = spawn(process.execPath, [join(process.cwd(), "container/build-server.mjs")], { env: { ...process.env, BUILD_WORKDIR: work, PORT: String(port) }, stdio: "ignore" });
    try {
      await new Promise((r) => setTimeout(r, 800));
      const box: ContainerStub = { fetch: (url, init) => fetch(url.replace("http://container", `http://127.0.0.1:${port}`), init) };
      const db = await setup();
      const job = await queued(db);
      const b = bindings(box);
      expect(await runContainerJob(db, keys, b, job.id)).toBe("done");
      const j = db.raw.prepare("SELECT status FROM build_jobs WHERE id = ?").get(job.id);
      expect(j).toEqual({ status: "succeeded" });
      const html = await (await serveSite(new Request("https://svelte-app.devstack.bid/"), b.sites)).text();
      expect(html).toMatch(/<script defer src=['"]\/build\/bundle\.js['"]>/);
      const js = await serveSite(new Request("https://svelte-app.devstack.bid/build/bundle.js"), b.sites);
      expect(js.status).toBe(200);
      console.log(events(db, job.id).map((e) => `[${e.phase}] ${e.message}`).slice(-6).join("\n"));
    } finally {
      srv.kill();
    }
  }, 300_000);
});
