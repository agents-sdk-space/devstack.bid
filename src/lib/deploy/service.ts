import "server-only";
import { readBlob, readTree } from "@/lib/auth/github-api";
import { safeBranch } from "@/lib/auth/github-policy";
import type { D1Like } from "@/lib/chat/store";
import { audit } from "@/lib/connections/audit";
import { loadCredential, loadGithubToken, type SealKeys } from "@/lib/connections/credentials";
import { ServiceError, takeQuota } from "@/lib/connections/github-service";
import { LIMITS, safeWorkerName } from "@/lib/connections/policy";
import type { ProjectRow } from "@/lib/connections/projects";
import { isAssetFile } from "./cloudflare";
import { DeployError, type DeployFile } from "./provider";
import { pickProvider } from "./providers";
import { sanitizeLog } from "./sanitize";
import { resolveProfile, type DeployProfile } from "./templates";

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
  f: typeof fetch = fetch
): Promise<DeploymentRow> {
  const ref = safeBranch(rawRef || project.default_branch || "main");
  if (!ref || !project.repo_full_name) throw new ServiceError("invalid", "Invalid ref. / ref ไม่ถูกต้อง");
  const inflight = await db.prepare("SELECT id FROM deployments WHERE project_id = ?1 AND status IN ('queued','uploading') AND created_at > ?2").bind(project.id, Date.now() - 15 * 60_000).first<{ id: string }>();
  if (inflight) throw new ServiceError("conflict", "A deploy is already running for this project. / มี deploy กำลังทำงานอยู่", 409);
  const gh = await loadGithubToken(db, keys, uid);
  if (!gh) throw new ServiceError("reauth", "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", 401);
  const cred = await loadCredential(db, keys, uid, "cloudflare");
  if (!cred) throw new ServiceError("reauth", "Connect Cloudflare in /settings/connections first. / เชื่อมต่อ Cloudflare ก่อน", 401);
  const [owner, repo] = project.repo_full_name.split("/");
  const tree = await readTree(gh, owner, repo, ref);
  const profile = resolveProfile(project.template_id, tree.entries.filter((e) => e.type === "blob").map((e) => e.path));
  const provider = pickProvider(profile, "cloudflare", f);
  if (!provider) throw new ServiceError("invalid", profile.path === "none" ? ERROR_HINTS.not_deployable : ERROR_HINTS.needs_build, 422);
  await takeQuota(db, uid, "deploy");
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO deployments (id, project_id, user_id, ref, target, status) VALUES (?1, ?2, ?3, ?4, ?5, 'queued')").bind(id, project.id, uid, ref, provider.target).run();
  await audit(db, uid, "deploy.started", `${project.repo_full_name}@${ref}`);
  const name = safeWorkerName(project.name) ?? `devstack-${id.slice(0, 8)}`;

  waitUntil(
    (async () => {
      try {
        const files: DeployFile[] = [];
        for (const e of selectFiles(profile, tree.entries)) files.push({ path: e.path, bytes: await readBlob(gh, owner, repo, e.sha!) });
        const out = await provider.deploy({ name, profile, files, credential: cred }, (s) => setStatus(db, id, { status: s }));
        await setStatus(db, id, { status: "live", url: out.url, cf_version_id: out.versionId }, true);
        await audit(db, uid, "deploy.live", id);
      } catch (err) {
        const code = err instanceof DeployError ? err.code : (err as { status?: number })?.status ? "github" : "internal";
        const detail = err instanceof DeployError ? err.detail : String((err as Error)?.message ?? err);
        await setStatus(db, id, { status: "failed", error_code: code, error_log: sanitizeLog(`${detail}\nHint: ${ERROR_HINTS[code] ?? ""}`, [cred.secret, gh]) }, true).catch(() => undefined);
        await audit(db, uid, "deploy.failed", `${id}:${code}`);
        console.warn(JSON.stringify({ at: "deploy", event: "failed", code }));
      }
    })()
  );
  return { id, project_id: project.id, user_id: uid, commit_sha: null, ref, target: provider.target, status: "queued", url: null, cf_version_id: null, error_code: null, error_log: null, fix_attempts: 0, created_at: Date.now(), finished_at: null };
}
