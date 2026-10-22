// Git auto-deploy: GitHub push / pull_request webhooks → production or preview builds + commit statuses.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runContainerJob, type BuildBindings, type ContainerStub } from "@/lib/build/executor";
import { sealKeys, seal } from "@/lib/connections/credentials";
import { aggregateStatus, autoDeployAllowed, claimDelivery, drainFreeSlots, drainPending, handleGitEvent, takeWebhookSlot, planFromEvent, WEBHOOK_BUILDS_PER_HOUR } from "@/lib/github/autodeploy";
import { verifyWebhook } from "@/lib/github/webhook";
import type { R2BucketLike } from "@/lib/hosting/serve";
import { sqliteD1 } from "./helpers/sqlite-d1";
import { sweepBuilds } from "@/lib/build/sweep";
import { failJob } from "@/lib/build/jobs";

const keys = sealKeys("test-cookie-secret-0123456789abcdef", {});
const SHA = "5b3da65ea310f98480c5258af97ff4d5c6f9d5b0";
const SHA2 = "1111111111111111111111111111111111111111";
const REPO_ID = 4242;
const OWNER_TOKEN = "gho_testOwnerTokenNotReal0000000000000";

function memBucket(): R2BucketLike {
  const map = new Map<string, Uint8Array>();
  return {
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

function ghFetch() {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")), auth: new Headers(init?.headers).get("authorization") });
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

function bindings(extra: Partial<BuildBindings> = {}): BuildBindings & { sent: unknown[] } {
  const sent: unknown[] = [];
  return { queue: { send: async (b: unknown) => { sent.push(b); } }, artifacts: memBucket(), sites: memBucket(), container: () => ({ fetch: async () => new Response("unused") }), dnsReady: true, sent, ...extra } as never;
}

async function setup(opts: { linked?: boolean; token?: boolean; canPush?: boolean } = {}) {
  const db = sqliteD1();
  db.raw.exec(`INSERT INTO users (id) VALUES ('userA');
    INSERT INTO projects (id, user_id, name, repo_full_name, default_branch, production_branch, slug, output_directory) VALUES ('projA-0001', 'userA', 'Svelte App', 'acme/site', 'main', 'main', 'svelte-app', 'public');`);
  if (opts.linked !== false) db.raw.exec(`INSERT INTO project_connections (id, project_id, user_id, provider, repo_id, repo_full_name, private, can_push) VALUES ('c1', 'projA-0001', 'userA', 'github', ${REPO_ID}, 'acme/site', 0, ${opts.canPush === false ? 0 : 1});`);
  if (opts.token !== false) db.raw.prepare("INSERT INTO github_credentials (user_id, token_enc, scope) VALUES (?, ?, 'repo')").run("userA", await seal(keys, "github", "userA", OWNER_TOKEN));
  return db;
}

const push = (branch: string, sha = SHA, extra: Record<string, unknown> = {}) => ({ ref: `refs/heads/${branch}`, after: sha, deleted: false, repository: { id: REPO_ID }, ...extra });
const pr = (action: string, headRepo = REPO_ID, sha = SHA) => ({ action, number: 7, repository: { id: REPO_ID }, pull_request: { number: 7, head: { ref: "feature/x", sha, repo: { id: headRepo } } } });

describe("planFromEvent", () => {
  it("maps push and PR events and ignores everything else", () => {
    expect(planFromEvent("push", push("main"))).toMatchObject({ kind: "push", branch: "main", sha: SHA });
    expect(planFromEvent("push", push("main", "0".repeat(40)))).toEqual({ skip: "no_commit" });
    expect(planFromEvent("push", { ...push("main"), ref: "refs/tags/v1" })).toEqual({ skip: "not_a_branch" });
    expect(planFromEvent("push", push("main", SHA, { deleted: true }))).toEqual({ skip: "branch_deleted" });
    expect(planFromEvent("pull_request", pr("opened"))).toMatchObject({ kind: "pr", branch: "feature/x", prNumber: 7 });
    expect(planFromEvent("pull_request", pr("synchronize"))).toMatchObject({ kind: "pr" });
    expect(planFromEvent("pull_request", pr("closed"))).toEqual({ skip: "pr_closed" });
    expect(planFromEvent("pull_request", pr("opened", 999))).toEqual({ skip: "fork_pr" });
    expect(planFromEvent("ping", { repository: { id: 1 } })).toEqual({ skip: "event_ignored" });
  });
});

describe("webhook signature", () => {
  async function signed(secret: string, body: string, sigSecret = secret) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sigSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
    return new Request("https://devstack.bid/api/github/webhook", { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${mac}`, "x-github-delivery": "72d3162e-cc78-11e3-81ab-4c9367dc0958", "x-github-event": "push" } });
  }
  it("accepts the right secret and rejects a wrong one", async () => {
    const body = JSON.stringify(push("main"));
    expect(await verifyWebhook(await signed("s3cret-test", body), async () => "s3cret-test")).toMatchObject({ ok: true, event: "push" });
    expect(await verifyWebhook(await signed("s3cret-test", body, "other"), async () => "s3cret-test")).toMatchObject({ ok: false, status: 401, reason: "bad_signature" });
  });
});

describe("handleGitEvent", () => {
  it("ignores repositories that are not linked to a project", async () => {
    const db = await setup({ linked: false });
    const b = bindings();
    expect(await handleGitEvent(db, keys, b, "push", push("main"), ghFetch().f)).toEqual({ status: "ignored:not_linked" });
    expect(b.sent).toHaveLength(0);
  });

  it("push to the production branch → production build + pending status with the production URL", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const r = await handleGitEvent(db, keys, b, "push", push("main"), gh.f);
    expect(r.status).toBe("queued:1");
    expect(r.url).toBe("https://svelte-app.devstack.bid");
    const job = db.raw.prepare("SELECT environment, trigger, commit_sha, ref FROM build_jobs WHERE id = ?").get(r.buildJobId) as Record<string, string>;
    expect(job).toEqual({ environment: "production", trigger: "push", commit_sha: SHA, ref: "main" });
    expect(b.sent).toEqual([{ jobId: r.buildJobId }]);
    expect(gh.calls).toHaveLength(1);
    expect(gh.calls[0].url).toBe(`https://api.github.com/repos/acme/site/statuses/${SHA}`);
    expect(gh.calls[0].body).toMatchObject({ state: "pending", context: "devstack/svelte-app/production", target_url: "https://svelte-app.devstack.bid" });
  });

  it("other branches and PRs → preview builds with their own URL; same commit is built once", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const r1 = await handleGitEvent(db, keys, b, "push", push("feature/x"), gh.f);
    expect(r1.status).toBe("queued:1");
    expect(r1.url).toMatch(/^https:\/\/svelte-app-[a-z0-9]{6}\.devstack\.bid$/);
    const env = db.raw.prepare("SELECT environment FROM build_jobs WHERE id = ?").get(r1.buildJobId) as { environment: string };
    expect(env.environment).toBe("preview");
    // PR opened for the same branch+commit: reuses the queued preview instead of a second build.
    const r2 = await handleGitEvent(db, keys, b, "pull_request", pr("opened"), gh.f);
    expect(r2.buildJobId).toBe(r1.buildJobId);
    expect(b.sent).toHaveLength(1);
    expect(gh.calls.every((c) => c.body.context === "devstack/svelte-app/preview")).toBe(true);
  });

  it("fork PRs never build", async () => {
    const db = await setup();
    const b = bindings();
    expect((await handleGitEvent(db, keys, b, "pull_request", pr("opened", 999), ghFetch().f)).status).toBe("ignored:fork_pr");
    expect(b.sent).toHaveLength(0);
  });

  it("rate-limits automatic builds per project per hour and reports it on the commit", async () => {
    const db = await setup();
    for (let i = 0; i < WEBHOOK_BUILDS_PER_HOUR; i++) expect(await takeWebhookSlot(db, "projA-0001", Date.now())).toBe(true);
    const gh = ghFetch();
    const b = bindings();
    expect((await handleGitEvent(db, keys, b, "push", push("feature/y", SHA2), gh.f)).status).toBe("rate_limited:1");
    expect(b.sent).toHaveLength(0);
    expect(gh.calls[0].body.state).toBe("failure");
    expect(String(gh.calls[0].body.description)).toMatch(/limit of 20 automatic builds per hour/);
  });

  it("missing build infrastructure is reported, not faked", async () => {
    const db = await setup();
    const gh = ghFetch();
    const r = await handleGitEvent(db, keys, bindings({ queue: null }), "push", push("main"), gh.f);
    expect(r.status).toBe("failed:blocked:1");
    expect(gh.calls[0].body.state).toBe("error");
  });

  it("the executor posts the final success status with the live URL; the token is never in a status body", async () => {
    const db = await setup();
    const gh = ghFetch();
    const box: ContainerStub = {
      async fetch(url) {
        if (url.endsWith("/build")) return new Response(JSON.stringify({ t: "phase", phase: "uploading" }) + "\n" + JSON.stringify({ t: "result", ok: true }) + "\n");
        if (url.endsWith("/artifact")) return new Response(tarOf({ "index.html": "ok" }) as BlobPart);
        return new Response("ok");
      },
      async stop() {},
    };
    const b = bindings({ container: () => box, fetch: gh.f });
    const r = await handleGitEvent(db, keys, b, "push", push("feature/x"), gh.f);
    await runContainerJob(db, keys, b, r.buildJobId!);
    const last = gh.calls.at(-1)!;
    expect(last.body).toMatchObject({ state: "success", context: "devstack/svelte-app/preview", target_url: r.url });
    expect(JSON.stringify(gh.calls.map((c) => c.body))).not.toContain(OWNER_TOKEN);
  });

  it("two rapid pushes to main: the newest commit wins (queued older build is canceled)", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const r1 = await handleGitEvent(db, keys, b, "push", push("main", SHA), gh.f);
    const r2 = await handleGitEvent(db, keys, b, "push", push("main", SHA2), gh.f);
    expect(r1.status).toBe("queued:1");
    expect(r2.status).toBe("queued:1");
    const j1 = db.raw.prepare("SELECT status, error_code FROM build_jobs WHERE id = ?").get(r1.buildJobId) as Record<string, string>;
    expect(j1).toEqual({ status: "canceled", error_code: "superseded" });
    const j2 = db.raw.prepare("SELECT status, commit_sha FROM build_jobs WHERE id = ?").get(r2.buildJobId) as Record<string, string>;
    expect(j2).toEqual({ status: "queued", commit_sha: SHA2 });
    expect(gh.calls.some((c) => c.url.endsWith(SHA) && c.body.state === "failure" && /Superseded/.test(String(c.body.description)))).toBe(true);
  });

  it("push to main while the build is running: cancel requested, newest commit waits and starts when the build ends", async () => {
    const db = await setup();
    const gh = ghFetch();
    const box: ContainerStub = {
      async fetch(url) {
        if (url.endsWith("/build")) {
          // A second push arrives while the first build is running.
          await handleGitEvent(db, keys, b, "push", push("main", SHA2), gh.f);
          return new Response(JSON.stringify({ t: "result", ok: false, code: "canceled" }) + "\n");
        }
        return new Response("ok");
      },
      async stop() {},
    };
    const b = bindings({ container: () => box, fetch: gh.f });
    const r1 = await handleGitEvent(db, keys, b, "push", push("main", SHA), gh.f);
    await runContainerJob(db, keys, b, r1.buildJobId!);
    expect((db.raw.prepare("SELECT cancel_requested, status FROM build_jobs WHERE id = ?").get(r1.buildJobId) as Record<string, number | string>)).toMatchObject({ cancel_requested: 1, status: "canceled" });
    const next = db.raw.prepare("SELECT status, commit_sha, environment FROM build_jobs WHERE commit_sha = ? AND status = 'queued'").get(SHA2) as Record<string, string>;
    expect(next).toEqual({ status: "queued", commit_sha: SHA2, environment: "production" });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM git_pending_builds").get()).toEqual({ n: 0 });
  });

  it("two PRs at once build in parallel as separate previews", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const a = await handleGitEvent(db, keys, b, "pull_request", pr("opened"), gh.f);
    const other = { action: "opened", number: 8, repository: { id: REPO_ID }, pull_request: { number: 8, head: { ref: "feature/z", sha: SHA2, repo: { id: REPO_ID } } } };
    const c = await handleGitEvent(db, keys, b, "pull_request", other, gh.f);
    expect(a.status).toBe("queued:1");
    expect(c.status).toBe("queued:1");
    expect(a.url).not.toBe(c.url);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM build_jobs WHERE environment = 'preview' AND status = 'queued'").get()).toEqual({ n: 2 });
  });

  it("aggregates outcomes across linked projects", async () => {
    expect(aggregateStatus([{ status: "queued" }, { status: "queued" }, { status: "rate_limited" }])).toBe("queued:2,rate_limited:1");
    const db = await setup();
    db.raw.exec(`INSERT INTO projects (id, user_id, name, repo_full_name, default_branch, slug) VALUES ('projB-0001', 'userA', 'Second', 'acme/site', 'main', 'second');
      INSERT INTO project_connections (id, project_id, user_id, provider, repo_id, repo_full_name, private, can_push) VALUES ('c2', 'projB-0001', 'userA', 'github', ${REPO_ID}, 'acme/site', 0, 1);`);
    const gh = ghFetch();
    expect((await handleGitEvent(db, keys, bindings(), "push", push("main"), gh.f)).status).toBe("queued:2");
    expect(new Set(gh.calls.map((x) => x.body.context))).toEqual(new Set(["devstack/svelte-app/production", "devstack/second/production"]));
  });

  it("M1: someone who linked a repo they can't push to gets no auto-deploy", async () => {
    const db = await setup({ canPush: false });
    const b = bindings();
    expect((await handleGitEvent(db, keys, b, "push", push("main"), ghFetch().f)).status).toBe("ignored:no_push_permission:1");
    expect(b.sent).toHaveLength(0);
  });

  it("M1: first delivery with an installation binds it; other installations are refused afterwards", async () => {
    const db = await setup();
    const b = bindings();
    const r1 = await handleGitEvent(db, keys, b, "push", push("main", SHA, { installation: { id: 77 } }), ghFetch().f);
    expect(r1.status).toBe("queued:1");
    expect(db.raw.prepare("SELECT installation_id FROM project_connections WHERE id = 'c1'").get()).toEqual({ installation_id: 77 });
    expect((await handleGitEvent(db, keys, b, "push", push("feature/q", SHA2, { installation: { id: 88 } }), ghFetch().f)).status).toBe("ignored:installation_mismatch:1");
    expect((await handleGitEvent(db, keys, b, "push", push("feature/q", SHA2), ghFetch().f)).status).toBe("ignored:installation_mismatch:1");
    expect(autoDeployAllowed({ installation_id: 77, can_push: 0 }, 77)).toEqual({ ok: true, bind: false });
  });

  it("follows a renamed repository (same repo id)", async () => {
    const db = await setup();
    await handleGitEvent(db, keys, bindings(), "push", push("main", SHA, { repository: { id: REPO_ID, full_name: "acme/site-renamed" } }), ghFetch().f);
    expect(db.raw.prepare("SELECT repo_full_name FROM projects WHERE id = 'projA-0001'").get()).toEqual({ repo_full_name: "acme/site-renamed" });
  });

  it("a failed job does not block rebuilding the same commit", async () => {
    const db = await setup();
    const b = bindings();
    const r1 = await handleGitEvent(db, keys, b, "push", push("main"), ghFetch().f);
    db.raw.prepare("UPDATE build_jobs SET status = 'failed' WHERE id = ?").run(r1.buildJobId);
    const r2 = await handleGitEvent(db, keys, b, "push", push("main"), ghFetch().f);
    expect(r2.status).toBe("queued:1");
    expect(r2.buildJobId).not.toBe(r1.buildJobId);
  });

  // Put a running production build (SHA) in place, then a pending newer commit.
  async function runningWithPending(db: ReturnType<typeof sqliteD1>, b: BuildBindings, gh: ReturnType<typeof ghFetch>) {
    const r1 = await handleGitEvent(db, keys, b, "push", push("main", SHA), gh.f);
    db.raw.prepare("UPDATE build_jobs SET status = 'building', heartbeat_at = 1, created_at = 1 WHERE id = ?").run(r1.buildJobId);
    expect((await handleGitEvent(db, keys, b, "push", push("main", SHA2), gh.f)).status).toBe("pending:1");
    return r1.buildJobId!;
  }

  it("sweeper timeout frees the slot and starts the newest waiting commit", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const old = await runningWithPending(db, b, gh);
    const r = await sweepBuilds(db, Date.now(), (j) => drainPending(db, keys, b, j, gh.f));
    expect(r.timedOut).toContain(old);
    const next = db.raw.prepare("SELECT status, environment FROM build_jobs WHERE commit_sha = ?").get(SHA2) as Record<string, string>;
    expect(next).toEqual({ status: "queued", environment: "production" });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM git_pending_builds").get()).toEqual({ n: 0 });
    // Nothing timed-out retried in the slot (newer commit wins).
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM build_jobs WHERE commit_sha = ? AND status = 'queued'").get(SHA)).toEqual({ n: 0 });
  });

  it("cron drainFreeSlots starts waiting commits whose slot is free, leaves busy ones", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const old = await runningWithPending(db, b, gh);
    expect(await drainFreeSlots(db, keys, b, gh.f)).toBe(0); // still building
    db.raw.prepare("UPDATE build_jobs SET status = 'failed' WHERE id = ?").run(old);
    expect(await drainFreeSlots(db, keys, b, gh.f)).toBe(1);
    expect((db.raw.prepare("SELECT status FROM build_jobs WHERE commit_sha = ?").get(SHA2) as { status: string }).status).toBe("queued");
  });

  it("an overwritten pending commit gets a failure status", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    await runningWithPending(db, b, gh);
    await handleGitEvent(db, keys, b, "push", push("main", "2222222222222222222222222222222222222222"), gh.f);
    expect(gh.calls.some((c) => c.url.endsWith(SHA2) && c.body.state === "failure" && String(c.body.description) === `Superseded by newer commit ${"2222222222222222222222222222222222222222".slice(0, 7)}`)).toBe(true);
    expect(db.raw.prepare("SELECT commit_sha FROM git_pending_builds").get()).toEqual({ commit_sha: "2222222222222222222222222222222222222222" });
  });

  it("failJob does not retry an old commit when a newer one is waiting", async () => {
    const db = await setup();
    const b = bindings();
    const gh = ghFetch();
    const old = await runningWithPending(db, b, gh);
    db.raw.prepare("UPDATE build_jobs SET max_attempts = 3 WHERE id = ?").run(old);
    const r = await failJob(db, old, "building", "executor_lost");
    expect(r.failed).toBeTruthy();
    expect(r.retry).toBeNull();
  });

  it("redelivery of a delivery stuck in processing > 15 min is reclaimed but never double-builds", async () => {
    const db = await setup();
    const b = bindings();
    const d = { delivery: "72d3162e-cc78-11e3-81ab-4c9367dc0958", event: "push", installationId: null, repoId: REPO_ID };
    expect(await claimDelivery(db, d)).toBe(true);
    const r1 = await handleGitEvent(db, keys, b, "push", push("main"), ghFetch().f);
    db.raw.prepare("UPDATE webhook_deliveries SET status = 'processing', received_at = ? WHERE delivery_id = ?").run(Date.now() - 16 * 60_000, d.delivery);
    expect(await claimDelivery(db, d)).toBe(true); // stuck → reprocess
    const r2 = await handleGitEvent(db, keys, b, "push", push("main"), ghFetch().f);
    expect(r2.buildJobId).toBe(r1.buildJobId);
    expect(b.sent).toHaveLength(1);
    db.raw.prepare("UPDATE webhook_deliveries SET status = 'queued:1' WHERE delivery_id = ?").run(d.delivery);
    expect(await claimDelivery(db, d)).toBe(false); // finished → deduped
  });
});
