// Milestone 2 groundwork: build state machine, retry, idempotency, cancellation, timeouts, log redaction, commit SHA.
import { describe, expect, it, vi } from "vitest";
import { ACTIVE_STATES, BUILD_STATES, TERMINAL_STATES, backoffMs, canTransition, deploymentStatusFor, idempotencyKey, isRetryable, nextStates, shouldRetry } from "@/lib/build/state";
import { appendEvent, createBuildJob, failJob, finishCanceled, getJob, heartbeat, listEvents, requestCancel, snapshotConfig, sweepTimeouts, transitionJob } from "@/lib/build/jobs";
import { sanitizeLog } from "@/lib/deploy/sanitize";
import { COMMIT_SHA, resolveCommit } from "@/lib/deploy/service";
import { sqliteD1 } from "./helpers/sqlite-d1";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function setup() {
  const db = sqliteD1();
  db.raw.exec("INSERT INTO users (id) VALUES ('userA'), ('userB'); INSERT INTO projects (id, user_id, name) VALUES ('projA-0001', 'userA', 'a'), ('projB-0001', 'userB', 'b')");
  return db;
}
const job = (db: ReturnType<typeof setup>, extra: Partial<Parameters<typeof createBuildJob>[1]> = {}) =>
  createBuildJob(db, { projectId: "projA-0001", userId: "userA", executor: "direct", commitSha: SHA, ref: "main", ...extra });

describe("state machine", () => {
  it("has all spec states and the happy path", () => {
    expect(BUILD_STATES).toEqual(["queued", "claimed", "installing", "building", "uploading", "succeeded", "failed", "canceled", "timed_out"]);
    const path = ["queued", "claimed", "installing", "building", "uploading", "succeeded"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("terminal states are final; no skipping back", () => {
    for (const t of TERMINAL_STATES) expect(nextStates(t)).toHaveLength(0);
    expect(canTransition("building", "installing")).toBe(false);
    expect(canTransition("queued", "succeeded")).toBe(false);
    for (const a of ACTIVE_STATES) for (const t of ["failed", "canceled", "timed_out"] as const) expect(canTransition(a, t)).toBe(true);
  });
  it("maps onto existing deployment statuses", () => {
    expect(deploymentStatusFor("succeeded")).toBe("live");
    expect(deploymentStatusFor("timed_out")).toBe("failed");
    expect(deploymentStatusFor("building")).toBe("uploading");
    expect(deploymentStatusFor("claimed")).toBe("queued");
  });
});

describe("retry policy", () => {
  it("retries only transient errors within the attempt budget", () => {
    expect(isRetryable("cf_api")).toBe(true);
    expect(isRetryable("cf_auth")).toBe(false);
    expect(isRetryable("build_failed")).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(shouldRetry({ attempt: 1, max_attempts: 3 }, "network")).toBe(true);
    expect(shouldRetry({ attempt: 3, max_attempts: 3 }, "network")).toBe(false);
    expect(shouldRetry({ attempt: 1, max_attempts: 3, cancel_requested: 1 }, "network")).toBe(false);
  });
  it("exponential backoff with jitter, capped", () => {
    expect(backoffMs(1, { rand: () => 0.999 })).toBeLessThan(5_000);
    expect(backoffMs(3, { rand: () => 0.999 })).toBeGreaterThan(19_000);
    expect(backoffMs(30, { rand: () => 1 })).toBe(300_000);
    expect(backoffMs(2, { rand: () => 0 })).toBe(0);
  });
});

describe("jobs in D1", () => {
  it("walks the full lifecycle with optimistic concurrency", async () => {
    const db = setup();
    const { job: j } = await job(db);
    expect(j.status).toBe("queued");
    const c = await transitionJob(db, j.id, "queued", "claimed", {}, 1000);
    expect(c).toMatchObject({ status: "claimed", started_at: 1000 });
    expect(await transitionJob(db, j.id, "queued", "claimed")).toBeNull(); // second worker loses
    await transitionJob(db, j.id, "claimed", "installing");
    await transitionJob(db, j.id, "installing", "building");
    await transitionJob(db, j.id, "building", "uploading");
    const done = await transitionJob(db, j.id, "uploading", "succeeded", { artifact_key: "a/b" }, 9000);
    expect(done).toMatchObject({ status: "succeeded", finished_at: 9000, artifact_key: "a/b" });
    await expect(transitionJob(db, j.id, "succeeded", "failed")).rejects.toThrow(/illegal/);
  });
  it("idempotency: the same key returns the same job", async () => {
    const db = setup();
    const key = await idempotencyKey({ projectId: "projA-0001", environment: "preview", commitSha: SHA, source: "push" });
    expect(key).toBe(await idempotencyKey({ projectId: "projA-0001", environment: "preview", commitSha: SHA, source: "push" }));
    expect(key).not.toBe(await idempotencyKey({ projectId: "projA-0001", environment: "production", commitSha: SHA, source: "push" }));
    const a = await job(db, { idempotencyKey: key });
    const b = await job(db, { idempotencyKey: key });
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ created: false, job: { id: a.job.id } });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM build_jobs").get()).toEqual({ n: 1 });
  });
  it("only one active job per project + environment (concurrent deployments)", async () => {
    const db = setup();
    await job(db);
    await expect(job(db)).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(job(db, { environment: "production" })).resolves.toMatchObject({ created: true });
  });
  it("rejects secrets in the config snapshot", () => {
    expect(() => snapshotConfig({ buildCommand: "npm run build", GITHUB_TOKEN: "x" })).toThrow(/secrets/);
    expect(snapshotConfig({ buildCommand: "npm run build" })).toBe('{"buildCommand":"npm run build"}');
  });
});

describe("cancellation", () => {
  it("queued → canceled immediately; idempotent afterwards", async () => {
    const db = setup();
    const { job: j } = await job(db);
    expect((await requestCancel(db, "userA", j.id)).status).toBe("canceled");
    expect((await requestCancel(db, "userA", j.id)).status).toBe("canceled");
  });
  it("running → cancel_requested, executor sees it on heartbeat and finishes", async () => {
    const db = setup();
    const { job: j } = await job(db);
    await transitionJob(db, j.id, "queued", "claimed");
    await transitionJob(db, j.id, "claimed", "building");
    expect(await heartbeat(db, j.id)).toEqual({ cancel: false });
    expect((await requestCancel(db, "userA", j.id)).cancel_requested).toBe(1);
    expect(await heartbeat(db, j.id)).toEqual({ cancel: true });
    expect(await finishCanceled(db, j.id, "building")).toMatchObject({ status: "canceled", error_code: "canceled" });
    expect(await heartbeat(db, j.id)).toBeNull();
  });
  it("a canceled job is not retried", async () => {
    const db = setup();
    const { job: j } = await job(db);
    await transitionJob(db, j.id, "queued", "claimed");
    await requestCancel(db, "userA", j.id);
    const r = await failJob(db, j.id, "claimed", "network");
    expect(r.retry).toBeNull();
  });
  it("account B cannot cancel or read account A's job", async () => {
    const db = setup();
    const { job: j } = await job(db);
    await expect(requestCancel(db, "userB", j.id)).rejects.toMatchObject({ status: 404 });
    expect(await getJob(db, "userB", j.id)).toBeNull();
    expect((await getJob(db, "userA", j.id))?.status).toBe("queued");
  });
});

describe("failure, retry and timeouts", () => {
  it("transient failure enqueues attempt 2 with backoff; permanent failure does not", async () => {
    const db = setup();
    const { job: j } = await job(db, { idempotencyKey: "k1" });
    await transitionJob(db, j.id, "queued", "claimed");
    const r = await failJob(db, j.id, "claimed", "cf_api", 10_000, () => 0.5);
    expect(r.failed).toMatchObject({ status: "failed", error_code: "cf_api" });
    expect(r.retry).toMatchObject({ status: "queued", attempt: 2, retry_of: j.id, trigger: "retry", idempotency_key: null, commit_sha: SHA, next_attempt_at: 12_500 });
    await transitionJob(db, r.retry!.id, "queued", "claimed");
    expect((await failJob(db, r.retry!.id, "claimed", "build_failed")).retry).toBeNull();
  });
  it("stops after max_attempts", async () => {
    const db = setup();
    let { job: j } = await job(db, { maxAttempts: 2 });
    await transitionJob(db, j.id, "queued", "claimed");
    const r1 = await failJob(db, j.id, "claimed", "network");
    j = r1.retry!;
    await transitionJob(db, j.id, "queued", "claimed");
    expect((await failJob(db, j.id, "claimed", "network")).retry).toBeNull();
  });
  it("sweeper times out stale jobs and retries them", async () => {
    const db = setup();
    const { job: j } = await job(db);
    await transitionJob(db, j.id, "queued", "claimed", {}, 0);
    await transitionJob(db, j.id, "claimed", "building", {}, 0);
    expect(await sweepTimeouts(db, 60_000)).toEqual([]); // within 20 min
    expect(await sweepTimeouts(db, 21 * 60_000)).toEqual([j.id]);
    expect((await getJob(db, "userA", j.id))?.status).toBe("timed_out");
    const retry = db.raw.prepare("SELECT attempt, status FROM build_jobs WHERE retry_of = ?").get(j.id);
    expect(retry).toEqual({ attempt: 2, status: "queued" });
  });
});

describe("build logs", () => {
  it("assigns sequential seq, redacts secrets, owner-scoped tail", async () => {
    const db = setup();
    const { job: j } = await job(db);
    const secret = "cf-plain-token-value-123";
    expect(await appendEvent(db, j.id, { message: "npm ci" })).toBe(1);
    expect(await appendEvent(db, j.id, { level: "error", phase: "building", message: `auth with ${secret} failed; GITHUB_TOKEN=ghp_${"a".repeat(36)}` }, [secret])).toBe(2);
    const ev = await listEvents(db, "userA", j.id);
    expect(ev.map((e) => e.seq)).toEqual([1, 2]);
    expect(ev[1].message).not.toContain(secret);
    expect(ev[1].message).not.toContain("ghp_");
    expect(await listEvents(db, "userA", j.id, 1)).toHaveLength(1);
    expect(await listEvents(db, "userB", j.id)).toHaveLength(0);
  });
  it("redacts URL credentials, npm/AWS tokens and private keys; keeps commit SHAs", () => {
    const out = sanitizeLog(`git clone https://x-access-token:abc123secret@github.com/a/b\nnpm_${"A".repeat(36)} AKIAABCDEFGHIJKLMNOP\n-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\ncommit ${SHA}`);
    expect(out).not.toMatch(/abc123secret|npm_A|AKIAABCD|MIIE/);
    expect(out).toContain("github.com/a/b");
    expect(out).toContain(SHA);
  });
});

describe("commit SHA on deploys", () => {
  it("resolves a branch to its commit, honours a pinned SHA, 422 on missing branch", async () => {
    const lookup = vi.fn(async () => SHA.toUpperCase());
    expect(await resolveCommit("t", "o", "r", "main", null, lookup)).toBe(SHA);
    expect(await resolveCommit("t", "o", "r", SHA, SHA, lookup)).toBe(SHA);
    expect(lookup).toHaveBeenCalledTimes(1);
    await expect(resolveCommit("t", "o", "r", "gone", null, async () => null)).rejects.toMatchObject({ status: 422 });
    expect(COMMIT_SHA.test(SHA)).toBe(true);
    expect(COMMIT_SHA.test("main")).toBe(false);
  });
  it("deployments table accepts commit_sha + new 0015 columns with safe defaults", () => {
    const db = setup();
    db.raw.exec(`INSERT INTO deployments (id, project_id, user_id, ref, commit_sha, target, status) VALUES ('d1', 'projA-0001', 'userA', 'main', '${SHA}', 'cf-workers', 'queued')`);
    expect(db.raw.prepare("SELECT commit_sha, environment, trigger FROM deployments WHERE id = 'd1'").get()).toEqual({ commit_sha: SHA, environment: "preview", trigger: "manual" });
  });
});
