/**
 * Container build executor (Milestone 2). Flow:
 *   import / redeploy → startContainerBuild (build_jobs row + deployments row + Queue message)
 *   Queue consumer   → runContainerJob: claim (cap 2) → container /build (clone at commit, install, build)
 *                      → stream redacted logs to build_events + R2 → /artifact tar → R2 → site files
 *                      → preview hostname (and production alias for production builds).
 * The GitHub token goes to the container in the request body only; it is never logged or stored.
 * Live URLs need the *.devstack.bid wildcard (DNS + route). Until SITES_DNS_READY=1 the URL is reported Blocked.
 */
import type { D1Like } from "@/lib/chat/store";
import { loadGithubToken, open, type SealKeys } from "@/lib/connections/credentials";
import type { ProjectRow } from "@/lib/connections/projects";
import { ServiceError } from "@/lib/connections/github-service";
import { getBranchSha } from "@/lib/auth/github-api";
import { safeBranch } from "@/lib/auth/github-policy";
import { previewHost, productionHost, siteSlug } from "@/lib/hosting/hostnames";
import { promoteProduction, publishPreview, publishServer, writeSite } from "@/lib/hosting/publish";
import { CfApiError, deployServerWorker, readServerBundle, serverWorkerName, type CfApi } from "@/lib/hosting/server-worker";
import { sanitizeLog } from "@/lib/deploy/sanitize";
import type { R2BucketLike } from "@/lib/hosting/serve";
import { BUILD_TIMEOUT_MS, claimWithCap, DAILY_BUILDS_PER_USER, userBuildsToday } from "./caps";
import { appendEvent, createBuildJob, createLogStream, failJob, finishCanceled, heartbeat, transitionJob, type BuildJobRow, type Environment } from "./jobs";
import type { BuildState } from "./state";
import { readTar } from "./tar";

export interface QueueLike { send(body: unknown, opts?: { delaySeconds?: number }): Promise<void> }
export interface ContainerStub { fetch(input: string, init?: RequestInit): Promise<Response>; stop?(): Promise<void> }

export interface BuildBindings {
  queue: QueueLike | null;
  artifacts: R2BucketLike | null;
  sites: R2BucketLike | null;
  container: ((jobId: string) => ContainerStub) | null;
  dnsReady: boolean;
  /** Cloudflare API access for per-project server Workers; null → server builds are Blocked. */
  cfApi?: CfApi | null;
}

/** Which pieces are missing (reported as Blocked, never faked). */
export function missingInfra(b: Partial<BuildBindings> | null | undefined): string[] {
  const m: string[] = [];
  if (!b?.queue) m.push("Queue BUILD_QUEUE");
  if (!b?.artifacts) m.push("R2 BUILD_ARTIFACTS");
  if (!b?.sites) m.push("R2 SITES");
  if (!b?.container) m.push("Container BUILD_CONTAINER");
  return m;
}

export interface BuildSpecSettings { root: string; install: string | null; build: string | null; output: string; node: string | null }

export function buildSettings(p: ProjectRow): BuildSpecSettings {
  return { root: p.root_directory ?? "", install: p.install_command ?? null, build: p.build_command ?? null, output: p.output_directory || "dist", node: p.node_version ?? null };
}

/** Create the job + deployment and enqueue. Throws ServiceError("blocked") when infrastructure is missing. */
export async function startContainerBuild(
  db: D1Like,
  keys: SealKeys,
  b: BuildBindings,
  uid: string,
  project: ProjectRow,
  opts: { ref?: string | null; environment?: Environment; trigger?: "manual" | "push" | "redeploy" } = {},
  lookup: typeof getBranchSha = getBranchSha
): Promise<{ job: BuildJobRow; deploymentId: string; previewUrl: string; productionUrl: string | null }> {
  const missing = missingInfra(b);
  if (missing.length) throw new ServiceError("blocked", `Build executor not provisioned (missing: ${missing.join(", ")}). / ยังไม่ได้เปิดระบบ build`, 503);
  if (!project.repo_full_name) throw new ServiceError("invalid", "Container builds need a GitHub repository.", 422);
  const slug = siteSlug(project.slug || project.name);
  if (!slug) throw new ServiceError("invalid", "Project name cannot be used as a site hostname.", 422);
  if ((await userBuildsToday(db, uid)) >= DAILY_BUILDS_PER_USER) throw new ServiceError("limit", `Daily build limit reached (${DAILY_BUILDS_PER_USER}/day). / ครบโควตา build วันนี้แล้ว`, 429);
  const token = await loadGithubToken(db, keys, uid);
  if (!token) throw new ServiceError("reauth", "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", 401);
  const ref = safeBranch(opts.ref || project.production_branch || project.default_branch || "main");
  if (!ref) throw new ServiceError("invalid", "Invalid branch.", 400);
  const [owner, repo] = project.repo_full_name.split("/");
  const commit = await lookup(token, owner, repo, ref);
  if (!commit) throw new ServiceError("invalid", `Branch ${ref} not found.`, 404);
  const environment = opts.environment ?? "production";
  const { job } = await createBuildJob(db, {
    projectId: project.id, userId: uid, executor: "cf-container", environment, trigger: opts.trigger ?? "manual", commitSha: commit, ref, maxAttempts: 2,
    config: { ...buildSettings(project), slug },
  });
  const deploymentId = crypto.randomUUID();
  await db.prepare("INSERT INTO deployments (id, project_id, user_id, ref, commit_sha, target, status, build_job_id, trigger, environment) VALUES (?1, ?2, ?3, ?4, ?5, 'devstack-sites', 'queued', ?6, ?7, ?8)")
    .bind(deploymentId, project.id, uid, ref, commit, job.id, job.trigger, environment).run();
  await appendEvent(db, job.id, { phase: "queued", message: `Queued build of ${project.repo_full_name}@${ref} (commit ${commit.slice(0, 7)}).` });
  await b.queue!.send({ jobId: job.id });
  return { job, deploymentId, previewUrl: `https://${previewHost(slug, deploymentId)}`, productionUrl: environment === "production" ? `https://${productionHost(slug)}` : null };
}

async function loadEnvVars(db: D1Like, keys: SealKeys, job: BuildJobRow): Promise<Record<string, string>> {
  const rows = await db.prepare("SELECT key, value_enc FROM environment_variables WHERE project_id = ?1 AND user_id = ?2 AND environment = ?3").bind(job.project_id, job.user_id, job.environment).all<{ key: string; value_enc: string }>().catch(() => ({ results: [] as { key: string; value_enc: string }[] }));
  const out: Record<string, string> = {};
  for (const r of rows.results ?? []) {
    const v = await open(keys, `env:${job.project_id}`, job.user_id, r.value_enc).catch(() => null);
    if (v) out[r.key] = v.value;
  }
  return out;
}

export type RunOutcome = "done" | "skipped" | { retryInSeconds: number };

/** Queue consumer body for one job. Idempotent: a redelivered message for a non-queued job is skipped. */
export async function runContainerJob(db: D1Like, keys: SealKeys, b: BuildBindings, jobId: string, now: () => number = Date.now): Promise<RunOutcome> {
  const job = await db.prepare("SELECT * FROM build_jobs WHERE id = ?1").bind(jobId).first<BuildJobRow>();
  if (!job || job.status !== "queued" || job.executor !== "cf-container") return "skipped";
  if (job.cancel_requested) {
    await transitionJob(db, jobId, "queued", "canceled", { error_code: "canceled" }, now());
    await db.prepare("UPDATE deployments SET status = 'failed', error_code = 'canceled', finished_at = ?2 WHERE build_job_id = ?1").bind(jobId, now()).run();
    return "done";
  }
  if (job.next_attempt_at && job.next_attempt_at > now()) return { retryInSeconds: Math.ceil((job.next_attempt_at - now()) / 1000) };
  const missing = missingInfra(b);
  if (missing.length) {
    await appendEvent(db, jobId, { level: "error", phase: "queued", message: `Blocked: build infrastructure missing (${missing.join(", ")}).` });
    await failJob(db, jobId, "queued", "invalid_config", now());
    return "done";
  }
  if (!(await claimWithCap(db, jobId, now()))) return { retryInSeconds: 30 };
  const cfg = JSON.parse(job.config_snapshot || "{}") as BuildSpecSettings & { slug: string };
  const project = await db.prepare("SELECT * FROM projects WHERE id = ?1 AND user_id = ?2").bind(job.project_id, job.user_id).first<ProjectRow>();
  let dep = await db.prepare("SELECT id FROM deployments WHERE build_job_id = ?1").bind(jobId).first<{ id: string }>();
  // Automatic retries get a new job id; the deployment row still points at the original attempt, so re-link it.
  if (!dep && job.retry_of) {
    dep = await db.prepare("SELECT id FROM deployments WHERE build_job_id = ?1").bind(job.retry_of).first<{ id: string }>();
    if (dep) await db.prepare("UPDATE deployments SET build_job_id = ?2, status = 'queued', error_code = NULL, error_log = NULL, finished_at = NULL WHERE id = ?1").bind(dep.id, jobId).run();
  }
  let state = "claimed" as BuildState;
  const token = await loadGithubToken(db, keys, job.user_id);
  const env = await loadEnvVars(db, keys, job);
  const secrets = [token, ...Object.values(env)];
  const log = createLogStream((l) => appendEvent(db, jobId, l, secrets), { secrets, phase: "claimed" });
  const closeDeployment = async (status: "live" | "failed", patch: { url?: string | null; code?: string | null; error?: string | null; alias?: string | null }) => {
    if (!dep) return;
    await db.prepare("UPDATE deployments SET status = ?2, url = ?3, error_code = ?4, error_log = ?5, alias_url = ?6, finished_at = ?7 WHERE id = ?1")
      .bind(dep.id, status, patch.url ?? null, patch.code ?? null, patch.error ?? null, patch.alias ?? null, now()).run();
  };
  const fail = async (code: string, message: string) => {
    await log.line(message, "error");
    await log.flush();
    await saveLog();
    const r = code === "canceled" ? { failed: await finishCanceled(db, jobId, state, now()), retry: null } : await failJob(db, jobId, state, code, now());
    await closeDeployment("failed", { code, error: message.slice(0, 500) });
    if (r.retry) await b.queue!.send({ jobId: r.retry.id }, { delaySeconds: Math.max(1, Math.ceil(((r.retry.next_attempt_at ?? now()) - now()) / 1000)) });
    return "done" as const;
  };
  const saveLog = () => b.artifacts!.put(`logs/${jobId}.txt`, log.transcript(), { httpMetadata: { contentType: "text/plain; charset=utf-8" } }).catch(() => null);
  const move = async (to: BuildState) => {
    if (state === to) return true;
    const r = await transitionJob(db, jobId, state, to, {}, now());
    if (!r) return false;
    state = to;
    log.setPhase(to);
    return true;
  };

  if (!project || !project.repo_full_name || !dep) return fail("invalid_config", "Project or deployment no longer exists.");
  const conn = await db.prepare("SELECT private FROM project_connections WHERE project_id = ?1 AND provider = 'github'").bind(job.project_id).first<{ private: number }>().catch(() => null);
  // Public repositories clone without a token; private ones need the owner's GitHub connection.
  if (!token && (!conn || conn.private !== 0)) return fail("invalid_config", "GitHub is not connected for this project owner; reconnect GitHub and redeploy.");
  if (!job.commit_sha) return fail("invalid_config", "Build has no commit.");

  const box = b.container!(jobId);
  const deadline = now() + BUILD_TIMEOUT_MS;
  let canceled = false;
  let timedOut = false;
  const watchdog = setInterval(async () => {
    const hb = await heartbeat(db, jobId, now()).catch(() => null);
    if ((hb?.cancel || now() > deadline) && !canceled && !timedOut) {
      if (now() > deadline) timedOut = true; else canceled = true;
      await box.fetch("http://container/cancel", { method: "POST" }).catch(() => null);
    }
  }, 10_000);
  try {
    await log.line(`Starting build container for ${project.repo_full_name}@${job.commit_sha.slice(0, 7)} (limit ${BUILD_TIMEOUT_MS / 60_000} min).`);
    const res = await box.fetch("http://container/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Public repos clone anonymously: the owner token is sent only when the repo is private (or unknown).
      body: JSON.stringify({ repo: project.repo_full_name, commit: job.commit_sha, root: cfg.root ?? "", install: cfg.install, build: cfg.build, output: cfg.output, env, token: conn && conn.private === 0 ? null : token }),
    });
    if (!res.ok || !res.body) {
      // Surface the Containers runtime reason (e.g. "Failed to start container: …"), redacted like every log line.
      const why = sanitizeLog((await res.text().catch(() => "")).replace(/\s+/g, " ").trim(), secrets, 300);
      return fail("executor_lost", `Build container did not start (HTTP ${res.status})${why ? `: ${why}` : ""}.`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    let result: { ok: boolean; code?: string; message?: string } | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const raw = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        let msg: { t: string; phase?: BuildState; chunk?: string; ok?: boolean; code?: string; message?: string };
        try { msg = JSON.parse(raw); } catch { continue; }
        if (msg.t === "phase" && msg.phase && ["installing", "building", "uploading"].includes(msg.phase)) {
          await log.flush();
          if (!(await move(msg.phase))) { canceled = true; break; }
        } else if (msg.t === "log" && typeof msg.chunk === "string") await log.write(msg.chunk);
        else if (msg.t === "result") result = { ok: !!msg.ok, code: msg.code, message: msg.message };
      }
    }
    await log.flush();
    if (timedOut) return fail("timed_out", `Build exceeded ${BUILD_TIMEOUT_MS / 60_000} minutes and was stopped.`);
    if (canceled || result?.code === "canceled") return fail("canceled", "Build canceled.");
    if (!result) return fail("executor_lost", "Build container stopped without a result.");
    if (!result.ok) return fail(result.code ?? "build_failed", result.message ?? "Build failed.");
    if (state !== "uploading" && !(await move("uploading"))) return fail("canceled", "Build canceled.");
    const art = await box.fetch("http://container/artifact");
    if (!art.ok) return fail("executor_lost", `Could not read build output (HTTP ${art.status}).`);
    const tar = new Uint8Array(await art.arrayBuffer());
    await b.artifacts!.put(`artifacts/${jobId}.tar`, tar, { httpMetadata: { contentType: "application/x-tar" } });
    const files = readTar(tar);
    const bundle = readServerBundle(files);
    if (bundle) {
      // Server app (Next.js/OpenNext): its own Worker `site-<slug>`, proxied by devstack-sites.
      if (!b.cfApi) return fail("invalid_config", "Server (Next.js) sites need the platform Cloudflare API token (SITES_CF_API_TOKEN); it is not configured.");
      const production = job.environment === "production";
      // Name from ids (not the reusable slug); previews get their own Worker so they never replace production.
      const worker = await serverWorkerName(project.id, production ? null : dep.id);
      await log.line(`Server build detected: deploying the project Worker (${bundle.assets.length} assets).`);
      try { await deployServerWorker(b.cfApi, worker, bundle, project.id); } catch (e) {
        const code = e instanceof CfApiError ? e.code : String((e as Error)?.message ?? "error").replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "error";
        // Full detail stays in server logs only; the user sees a stable error code.
        console.warn(JSON.stringify({ at: "server-worker-deploy", jobId, code, detail: e instanceof CfApiError ? e.detail : undefined }));
        return fail("cf_api", `Worker upload failed (error code ${code}).`);
      }
      const urls = await publishServer(b.sites!, cfg.slug, project.id, dep.id, worker, production);
      await transitionJob(db, jobId, "uploading", "succeeded", { artifact_key: `artifacts/${jobId}.tar` }, now());
      await log.line(`Ready: ${urls.preview}${urls.production ? ` (production ${urls.production})` : ""}`);
      await closeDeployment("live", { url: urls.preview, alias: urls.production });
      await saveLog();
      return "done";
    }
    const written = await writeSite(b.sites!, dep.id, files);
    await log.line(`Uploaded ${written.files} files (${Math.round(written.bytes / 1024)} KiB).`);
    const preview = await publishPreview(b.sites!, cfg.slug, project.id, dep.id);
    const production = job.environment === "production" ? await promoteProduction(b.sites!, cfg.slug, project.id, dep.id) : null;
    await transitionJob(db, jobId, "uploading", "succeeded", { artifact_key: `artifacts/${jobId}.tar` }, now());
    if (b.dnsReady) {
      await log.line(`Ready: ${preview}${production ? ` (production ${production})` : ""}`);
      await closeDeployment("live", { url: preview, alias: production });
    } else {
      await log.line(`Built and stored. Blocked: ${preview} will resolve once the *.devstack.bid wildcard DNS record and route exist.`, "warn");
      await closeDeployment("failed", { code: "site_url_blocked", error: "Build succeeded; public URL blocked until *.devstack.bid wildcard DNS + route are configured.", alias: production ?? preview });
    }
    await saveLog();
    return "done";
  } catch (e) {
    return fail("internal", `Executor error: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  } finally {
    clearInterval(watchdog);
    await box.stop?.().catch(() => null);
  }
}
