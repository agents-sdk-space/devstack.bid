import "server-only";
import { getBranchSha, readBlob, readTree } from "@/lib/auth/github-api";
import { safeBranch } from "@/lib/auth/github-policy";
import type { D1Like } from "@/lib/chat/store";
import { audit } from "@/lib/connections/audit";
import { loadCredential, loadGithubToken, type CredentialMeta, type SealKeys } from "@/lib/connections/credentials";
import { loadEnv } from "@/lib/connections/environment";
import { ServiceError, takeQuota } from "@/lib/connections/github-service";
import { LIMITS, safeWorkerName } from "@/lib/connections/policy";
import type { ProjectRow } from "@/lib/connections/projects";
import { isAssetFile } from "./cloudflare";
import { appendEvent, createBuildJob, failJob, finishCanceled, heartbeat, requestCancel, transitionJob, type BuildJobRow, type LogLevel } from "@/lib/build/jobs";
import type { BuildState } from "@/lib/build/state";
import { DeployError, type DeployFile, type DeployProvider } from "./provider";
import { pickProvider } from "./providers";
import { sanitizeLog } from "./sanitize";
import { profileById, resolveProfile, type DeployProfile } from "./templates";
import { loadProjectFiles, uploadProfile } from "./upload";

export type { BuildJobRow };
export type DeployStatus = "queued" | "uploading" | "live" | "failed";

export interface DeploymentRow {
  id: string;
  project_id: string;
  user_id: string;
  commit_sha: string | null;
  ref: string | null;
  target: string;
  status: DeployStatus;
  url: string | null;
  cf_version_id: string | null;
  error_code: string | null;
  error_log: string | null;
  fix_attempts: number;
  build_job_id?: string | null;
  trigger?: string | null;
  environment?: string | null;
  created_at: number;
  finished_at: number | null;
}

export const deploymentView = (d: DeploymentRow) => ({
  id: d.id,
  projectId: d.project_id,
  ref: d.ref,
  commit: d.commit_sha,
  target: d.target,
  status: d.status,
  url: d.url,
  versionId: d.cf_version_id,
  errorCode: d.error_code,
  errorLog: d.error_log,
  fixAttempts: d.fix_attempts,
  buildJobId: d.build_job_id ?? null,
  trigger: d.trigger ?? "manual",
  environment: d.environment ?? "preview",
  maxFixAttempts: LIMITS.maxFixAttempts,
  createdAt: d.created_at,
  finishedAt: d.finished_at,
});

/** Human hint per error code (shown in the timeline and given to the chat agent). */
export const ERROR_HINTS: Record<string, string> = {
  cf_auth: "Cloudflare rejected the token. Check it has Workers Scripts: Edit, or reconnect Cloudflare.",
  cf_account_missing: "Reconnect Cloudflare with your account id.",
  cf_api: "Cloudflare refused the upload. Read the log; often an invalid Worker module or a syntax error.",
  cf_assets: "Static asset upload failed. Retry; if it repeats, reduce file count/size.",
  cf_too_large: "Bundle too large for direct upload. Use the Deploy to Cloudflare button / Workers Builds.",
  missing_index: "No index.html at the repo root.",
  missing_entry: "Worker entry file not found (src/index.js).",
  needs_build: "This project needs a build step. Use 'Prepare for Cloudflare' + the Deploy to Cloudflare button / Workers Builds.",
  not_deployable: "This template is not deployable to Cloudflare Workers.",
  too_many_files: `More than ${LIMITS.maxFiles} files.`,
  too_large: `Bundle larger than ${LIMITS.maxBundleBytes / 1024 / 1024} MB.`,
  github: "Couldn't read the repository from GitHub.",
  internal: "Unexpected error.",
};

export async function getDeployment(db: D1Like, uid: string, id: string): Promise<DeploymentRow | null> {
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return null;
  return db.prepare("SELECT * FROM deployments WHERE id = ?1 AND user_id = ?2").bind(id, uid).first<DeploymentRow>();
}

export async function listDeployments(db: D1Like, uid: string, projectId: string): Promise<DeploymentRow[]> {
  const r = await db.prepare("SELECT * FROM deployments WHERE user_id = ?1 AND project_id = ?2 ORDER BY created_at DESC LIMIT 30").bind(uid, projectId).all<DeploymentRow>();
  return r.results ?? [];
}

export async function latestFailed(db: D1Like, uid: string): Promise<DeploymentRow | null> {
  return db.prepare("SELECT * FROM deployments WHERE user_id = ?1 AND status = 'failed' ORDER BY created_at DESC LIMIT 1").bind(uid).first<DeploymentRow>();
}

async function setStatus(db: D1Like, id: string, patch: Partial<Pick<DeploymentRow, "status" | "url" | "cf_version_id" | "error_code" | "error_log" | "commit_sha">>, done = false) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  const sets = keys.map((k, i) => `${k} = ?${i + 2}`);
  if (done) sets.push(`finished_at = ${Date.now()}`);
  await db.prepare(`UPDATE deployments SET ${sets.join(", ")} WHERE id = ?1`).bind(id, ...keys.map((k) => patch[k] ?? null)).run();
}

/** Count a self-heal fix against the failed deployment. Returns the new count or null when the cap is reached. */
export async function recordFixAttempt(db: D1Like, uid: string, id: string): Promise<number | null> {
  const d = await getDeployment(db, uid, id);
  if (!d || d.status !== "failed" || d.fix_attempts >= LIMITS.maxFixAttempts) return null;
  await db.prepare("UPDATE deployments SET fix_attempts = fix_attempts + 1 WHERE id = ?1 AND user_id = ?2 AND fix_attempts < ?3").bind(id, uid, LIMITS.maxFixAttempts).run();
  return d.fix_attempts + 1;
}

/** Pick the files to upload for a direct profile, enforcing 200 files / 10 MB before downloading. */
export function selectFiles(profile: DeployProfile, entries: { path: string; type: string; size?: number; sha?: string }[]) {
  const blobs = entries.filter((e) => e.type === "blob" && e.sha);
  const chosen = profile.target === "worker-assets" ? blobs.filter((e) => isAssetFile(e.path)) : blobs.filter((e) => /\.m?js$/.test(e.path) && !e.path.startsWith("node_modules/"));
  if (chosen.length > LIMITS.maxFiles) throw new DeployError("too_many_files", `${chosen.length} files`);
  const bytes = chosen.reduce((n, e) => n + (e.size ?? 0), 0);
  if (bytes > LIMITS.maxBundleBytes) throw new DeployError("too_large", `${bytes} bytes`);
  return chosen;
}

/** Remembered Environment entries CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (fallback when no connection row). */
async function rememberedCloudflare(db: D1Like, keys: SealKeys, uid: string): Promise<{ secret: string; meta: CredentialMeta } | null> {
  const secret = await loadEnv(db, keys, uid, "CLOUDFLARE_API_TOKEN").catch(() => null);
  const account = await loadEnv(db, keys, uid, "CLOUDFLARE_ACCOUNT_ID").catch(() => null);
  return secret && account && /^[a-f0-9]{32}$/.test(account) ? { secret, meta: { account_id: account } } : null;
}

export const COMMIT_SHA = /^[a-f0-9]{40}$/i;

/** Branch → commit SHA (or validate a pinned SHA's format). Missing branch = 422, not a silent default. */
export async function resolveCommit(
  token: string, owner: string, repo: string, ref: string, pinned: string | null,
  lookup: typeof getBranchSha = getBranchSha
): Promise<string> {
  if (pinned) return pinned;
  const sha = await lookup(token, owner, repo, ref);
  if (!sha || !COMMIT_SHA.test(sha)) throw new ServiceError("invalid", `Branch "${ref}" not found. / ไม่พบ branch`, 422);
  return sha.toLowerCase();
}

export interface DirectRun {
  db: D1Like;
  uid: string;
  deploymentId: string;
  jobId: string;
  name: string;
  profile: DeployProfile;
  provider: DeployProvider;
  credential: { secret: string; meta: CredentialMeta };
  /** Every plaintext secret in scope; redacted from every log line and error. */
  secrets: string[];
  collect: () => Promise<DeployFile[]>;
}

/**
 * Background half of a direct deploy, driven through the build-job state machine with real log lines:
 * queued → claimed → uploading → succeeded | failed | canceled. The deployments row mirrors the job.
 */
export async function runDirectDeploy(r: DirectRun): Promise<void> {
  const { db, jobId, deploymentId: id } = r;
  const log = (message: string, phase: BuildState, level: LogLevel = "info") => appendEvent(db, jobId, { message, phase, level }, r.secrets).catch(() => null);
  const canceled = async (from: BuildState) => {
    const hb = await heartbeat(db, jobId);
    if (!hb?.cancel) return false;
    await finishCanceled(db, jobId, from);
    await log("Canceled by the owner.", from, "warn");
    await setStatus(db, id, { status: "failed", error_code: "canceled", error_log: "Canceled by the owner." }, true).catch(() => undefined);
    await audit(db, r.uid, "deploy.failed", `${id}:canceled`);
    return true;
  };
  let state: BuildState = "queued";
  try {
    if (!(await transitionJob(db, jobId, "queued", "claimed"))) return; // canceled (or claimed) elsewhere
    state = "claimed";
    await log("Claimed by the direct executor.", state);
    if (await canceled(state)) return;
    const files = await r.collect();
    const bytes = files.reduce((n, f) => n + f.bytes.length, 0);
    await log(`Selected ${files.length} files (${(bytes / 1024).toFixed(1)} KB) for ${r.profile.target}.`, state);
    if (await canceled(state)) return;
    const out = await r.provider.deploy({ name: r.name, profile: r.profile, files, credential: r.credential }, async (s) => {
      if (state === "claimed" && (await transitionJob(db, jobId, "claimed", "uploading"))) state = "uploading";
      await log(`Uploading to Cloudflare Worker "${r.name}"…`, "uploading");
      await setStatus(db, id, { status: s });
    });
    if (state === "claimed" && (await transitionJob(db, jobId, "claimed", "uploading"))) state = "uploading";
    await transitionJob(db, jobId, state, "succeeded");
    await log(out.url ? `Live at ${out.url}` : "Uploaded (no workers.dev URL returned).", "succeeded");
    await setStatus(db, id, { status: "live", url: out.url, cf_version_id: out.versionId }, true);
    await audit(db, r.uid, "deploy.live", id);
  } catch (err) {
    const code = err instanceof DeployError ? err.code : (err as { status?: number })?.status ? "github" : "internal";
    const detail = err instanceof DeployError ? err.detail : String((err as Error)?.message ?? err);
    const text = sanitizeLog(`${detail}\nHint: ${ERROR_HINTS[code] ?? ""}`, r.secrets);
    await log(text, state, "error");
    await failJob(db, jobId, state, code).catch(() => undefined);
    await setStatus(db, id, { status: "failed", error_code: code, error_log: text }, true).catch(() => undefined);
    await audit(db, r.uid, "deploy.failed", `${id}:${code}`);
    console.warn(JSON.stringify({ at: "deploy", event: "failed", code }));
  }
}

/** Owner cancel of a deployment's job. A queued job stops at once; a running one at its next checkpoint. */
export async function cancelDeployment(db: D1Like, uid: string, id: string): Promise<{ deployment: DeploymentRow; job: BuildJobRow | null }> {
  const d = await getDeployment(db, uid, id);
  if (!d) throw new ServiceError("invalid", "Not found.", 404);
  if (!d.build_job_id) throw new ServiceError("conflict", "This deployment predates build jobs and can't be canceled.", 409);
  const job = await requestCancel(db, uid, d.build_job_id);
  if (job.status === "canceled" && (d.status === "queued" || d.status === "uploading")) {
    await appendEvent(db, job.id, { phase: "canceled", level: "warn", message: "Canceled by the owner before it started." }).catch(() => null);
    await setStatus(db, id, { status: "failed", error_code: "canceled", error_log: "Canceled by the owner." }, true);
  } else if (job.cancel_requested && !["succeeded", "failed", "canceled", "timed_out"].includes(job.status)) {
    await appendEvent(db, job.id, { phase: job.status, level: "warn", message: "Cancel requested; stopping at the next checkpoint (an upload already in progress finishes)." }).catch(() => null);
  }
  return { deployment: (await getDeployment(db, uid, id))!, job };
}

/**
 * POST /api/projects/:id/deploy. Validates synchronously (quota, one in flight, credentials, profile),
 * records a `queued` deployment and runs the upload in the background.
 */
export async function startDeploy(
  db: D1Like,
  keys: SealKeys,
  uid: string,
  project: ProjectRow,
  rawRef: string | null,
  waitUntil: (p: Promise<unknown>) => void,
  f: typeof fetch = fetch,
  /** Token entered with "Remember" off: used for this deploy only, never persisted. */
  once?: { secret: string; meta: CredentialMeta } | null
): Promise<DeploymentRow> {
  const upload = !project.repo_full_name;
  // A 40-hex ref = "redeploy this exact commit"; otherwise a branch name.
  const pinned = !upload && rawRef && COMMIT_SHA.test(rawRef) ? rawRef.toLowerCase() : null;
  const ref = upload ? "upload" : pinned ?? safeBranch(rawRef || project.default_branch || "main");
  if (!ref) throw new ServiceError("invalid", "Invalid ref. / ref ไม่ถูกต้อง");
  const inflight = await db.prepare("SELECT id FROM deployments WHERE project_id = ?1 AND status IN ('queued','uploading') AND created_at > ?2").bind(project.id, Date.now() - 15 * 60_000).first<{ id: string }>();
  if (inflight) throw new ServiceError("conflict", "A deploy is already running for this project. / มี deploy กำลังทำงานอยู่", 409);
  const gh = upload ? null : await loadGithubToken(db, keys, uid);
  if (!upload && !gh) throw new ServiceError("reauth", "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", 401);
  const cred = once ?? (await loadCredential(db, keys, uid, "cloudflare")) ?? (await rememberedCloudflare(db, keys, uid));
  if (!cred) throw new ServiceError("reauth", "Connect Cloudflare in /settings/connections first. / เชื่อมต่อ Cloudflare ก่อน", 401);
  const [owner, repo] = upload ? ["", ""] : project.repo_full_name!.split("/");
  // Resolve the branch to a commit first and read the tree AT that commit, so commit_sha is exactly what was deployed.
  const commitSha = upload ? null : await resolveCommit(gh!, owner, repo, ref, pinned);
  const rawTree = upload ? null : await readTree(gh!, owner, repo, commitSha!);
  // Imported monorepo projects (migration 0013): deploy only the configured root directory.
  const root = !upload && project.root_directory ? `${project.root_directory}/` : "";
  const tree = rawTree && root ? { ...rawTree, entries: rawTree.entries.filter((e) => e.path.startsWith(root)).map((e) => ({ ...e, path: e.path.slice(root.length) })) } : rawTree;
  const uploaded = upload ? await loadProjectFiles(db, project.id) : null;
  if (upload && !uploaded!.length) throw new ServiceError("invalid", "Upload a deploy zip first. / อัปโหลด zip ก่อน", 422);
  const profile = upload ? profileById(project.template_id) ?? uploadProfile(uploaded!) : resolveProfile(project.template_id, tree!.entries.filter((e) => e.type === "blob").map((e) => e.path));
  const provider = pickProvider(profile, "cloudflare", f);
  if (!provider) throw new ServiceError("invalid", profile.path === "none" ? ERROR_HINTS.not_deployable : ERROR_HINTS.needs_build, 422);
  await takeQuota(db, uid, "deploy");
  const id = crypto.randomUUID();
  // Every deploy is a build job (executor "direct", one attempt: nothing re-runs a direct job in the background).
  const { job } = await createBuildJob(db, {
    projectId: project.id, userId: uid, executor: "direct", environment: "preview", trigger: pinned ? "redeploy" : "manual",
    commitSha, ref, maxAttempts: 1, config: { profile: profile.id, target: profile.target, root: project.root_directory ?? "" },
  });
  await db.prepare("INSERT INTO deployments (id, project_id, user_id, ref, commit_sha, target, status, build_job_id, trigger) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8)").bind(id, project.id, uid, ref, commitSha, provider.target, job.id, job.trigger).run();
  await audit(db, uid, "deploy.started", `${project.repo_full_name ?? `upload:${project.id}`}@${ref}`);
  const name = safeWorkerName(project.name) ?? `devstack-${id.slice(0, 8)}`;
  const secrets = gh ? [cred.secret, gh] : [cred.secret];
  await appendEvent(db, job.id, { phase: "queued", message: upload ? `Queued deploy of uploaded files (profile ${profile.id}).` : `Queued deploy of ${project.repo_full_name}@${ref} (commit ${commitSha!.slice(0, 7)}, profile ${profile.id}).` }, secrets);

  waitUntil(
    runDirectDeploy({
      db, uid, deploymentId: id, jobId: job.id, name, profile, provider, credential: cred, secrets,
      collect: async () => {
        if (uploaded) {
          const keep = new Set(selectFiles(profile, uploaded.map((u) => ({ path: u.path, type: "blob", size: u.bytes.length, sha: "local" }))).map((e) => e.path));
          return uploaded.filter((u) => keep.has(u.path));
        }
        const files: DeployFile[] = [];
        for (const e of selectFiles(profile, tree!.entries)) files.push({ path: e.path, bytes: await readBlob(gh!, owner, repo, e.sha!) });
        return files;
      },
    })
  );
  return { id, project_id: project.id, user_id: uid, commit_sha: commitSha, ref, target: provider.target, status: "queued", url: null, cf_version_id: null, error_code: null, error_log: null, fix_attempts: 0, build_job_id: job.id, trigger: job.trigger, environment: "preview", created_at: Date.now(), finished_at: null };
}
