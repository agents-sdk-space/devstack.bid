// Direct deploys routed through build_jobs: real log lines, cancel, failure, sweeper. Real SQLite + migrations.
import { describe, expect, it } from "vitest";
import { getJob, listEvents, transitionJob, createBuildJob } from "@/lib/build/jobs";
import { sweepBuilds } from "@/lib/build/sweep";
import { DeployError, type DeployProvider } from "@/lib/deploy/provider";
import { cancelDeployment, getDeployment, runDirectDeploy, type DirectRun } from "@/lib/deploy/service";
import { DEPLOY_PROFILES } from "@/lib/deploy/templates";
import { sqliteD1 } from "./helpers/sqlite-d1";

const TOKEN = "cf-plain-secret-token-0001";

async function setup() {
  const db = sqliteD1();
  db.raw.exec("INSERT INTO users (id) VALUES ('userA'), ('userB'); INSERT INTO projects (id, user_id, name) VALUES ('projA-0001', 'userA', 'site')");
  const { job } = await createBuildJob(db, { projectId: "projA-0001", userId: "userA", executor: "direct", maxAttempts: 1, ref: "main" });
  db.raw.prepare("INSERT INTO deployments (id, project_id, user_id, ref, target, status, build_job_id) VALUES ('dep-00000001', 'projA-0001', 'userA', 'main', 'cf-workers', 'queued', ?)").run(job.id);
  return { db, jobId: job.id };
}

/** Test double for the Cloudflare provider (records calls; production uses createCloudflareProvider). */
function provider(behaviour: "ok" | "fail" = "ok"): DeployProvider & { calls: number } {
  const p = {
    id: "cloudflare" as const, credentialKind: "cloudflare" as const, target: "cf-workers", calls: 0,
    supports: () => true,
    async deploy(_i: Parameters<DeployProvider["deploy"]>[0], onStatus: (s: "uploading") => Promise<void>) {
      p.calls++;
      await onStatus("uploading");
      if (behaviour === "fail") throw new DeployError("cf_api", `PUT /accounts/x → 400 10021 bad module (token ${TOKEN})`);
      return { url: "https://site.example.workers.dev", versionId: "v1" };
    },
  };
  return p;
}

const run = (db: DirectRun["db"], jobId: string, prov: DeployProvider, collect?: DirectRun["collect"]) =>
  runDirectDeploy({
    db, uid: "userA", deploymentId: "dep-00000001", jobId, name: "site", profile: DEPLOY_PROFILES["chat-static"], provider: prov,
    credential: { secret: TOKEN, meta: { account_id: "a".repeat(32) } }, secrets: [TOKEN],
    collect: collect ?? (async () => [{ path: "index.html", bytes: new TextEncoder().encode("<h1>hi</h1>") }]),
  });

describe("direct deploy through build_jobs", () => {
  it("success: job walks claimed → uploading → succeeded with real log lines; deployment goes live", async () => {
    const { db, jobId } = await setup();
    await run(db, jobId, provider());
    expect((await getJob(db, "userA", jobId))?.status).toBe("succeeded");
    const ev = await listEvents(db, "userA", jobId);
    expect(ev.map((e) => e.phase)).toEqual(["claimed", "claimed", "uploading", "succeeded"]);
    expect(ev[1].message).toMatch(/Selected 1 files/);
    expect(ev[3].message).toContain("https://site.example.workers.dev");
    expect(await getDeployment(db, "userA", "dep-00000001")).toMatchObject({ status: "live", url: "https://site.example.workers.dev", cf_version_id: "v1" });
  });
  it("failure: error line is redacted, job failed (no background retry), deployment failed", async () => {
    const { db, jobId } = await setup();
    await run(db, jobId, provider("fail"));
    const job = await getJob(db, "userA", jobId);
    expect(job).toMatchObject({ status: "failed", error_code: "cf_api" });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM build_jobs").get()).toEqual({ n: 1 });
    const ev = await listEvents(db, "userA", jobId);
    const last = ev[ev.length - 1];
    expect(last).toMatchObject({ level: "error", phase: "uploading" });
    expect(last.message).not.toContain(TOKEN);
    const dep = await getDeployment(db, "userA", "dep-00000001");
    expect(dep).toMatchObject({ status: "failed", error_code: "cf_api" });
    expect(dep!.error_log).not.toContain(TOKEN);
  });
  it("cancel before start: queued job canceled at once, executor does nothing", async () => {
    const { db, jobId } = await setup();
    const r = await cancelDeployment(db, "userA", "dep-00000001");
    expect(r.job?.status).toBe("canceled");
    expect(r.deployment).toMatchObject({ status: "failed", error_code: "canceled" });
    const prov = provider();
    await run(db, jobId, prov);
    expect(prov.calls).toBe(0);
  });
  it("cancel while collecting files: stops at the checkpoint before upload", async () => {
    const { db, jobId } = await setup();
    const prov = provider();
    await run(db, jobId, prov, async () => {
      await cancelDeployment(db, "userA", "dep-00000001");
      return [{ path: "index.html", bytes: new Uint8Array([1]) }];
    });
    expect(prov.calls).toBe(0);
    expect((await getJob(db, "userA", jobId))?.status).toBe("canceled");
    expect(await getDeployment(db, "userA", "dep-00000001")).toMatchObject({ status: "failed", error_code: "canceled" });
    expect((await listEvents(db, "userA", jobId)).some((e) => /Cancel requested/.test(e.message))).toBe(true);
  });
  it("account B cannot cancel or read logs of A's deployment", async () => {
    const { db, jobId } = await setup();
    await expect(cancelDeployment(db, "userB", "dep-00000001")).rejects.toMatchObject({ status: 404 });
    expect(await listEvents(db, "userB", jobId)).toHaveLength(0);
  });
  it("legacy deployments without a job cannot be canceled", async () => {
    const { db } = await setup();
    db.raw.exec("INSERT INTO deployments (id, project_id, user_id, target, status) VALUES ('dep-legacy01', 'projA-0001', 'userA', 'cf-workers', 'live')");
    await expect(cancelDeployment(db, "userA", "dep-legacy01")).rejects.toMatchObject({ status: 409 });
  });
  it("resumable logs: after=<seq> returns only newer lines", async () => {
    const { db, jobId } = await setup();
    await run(db, jobId, provider());
    const all = await listEvents(db, "userA", jobId);
    expect((await listEvents(db, "userA", jobId, all[1].seq)).map((e) => e.seq)).toEqual(all.slice(2).map((e) => e.seq));
  });
});

describe("cron sweeper", () => {
  it("times out a stuck job and closes its deployment row", async () => {
    const { db, jobId } = await setup();
    await transitionJob(db, jobId, "queued", "claimed", {}, 0);
    const r = await sweepBuilds(db, 10 * 60_000);
    expect(r).toEqual({ timedOut: [jobId], deploymentsClosed: 1 });
    expect(await getDeployment(db, "userA", "dep-00000001")).toMatchObject({ status: "failed", error_code: "timed_out" });
    expect((await sweepBuilds(db, 20 * 60_000)).deploymentsClosed).toBe(0);
  });
});
