/**
 * Git auto-deploy from verified GitHub webhooks (Vercel-style):
 *   push to the project's production branch     → production build
 *   push to any other branch                     → preview build (own URL)
 *   pull_request opened / synchronize / reopened → preview build (own URL)
 * Only repositories linked to a project (project_connections, by numeric repo id) are built.
 * Fork PRs are ignored (their code must not run with the owner's credentials or env vars).
 * The result is reported back as a GitHub commit status with the deployment URL.
 * Nothing here logs the payload, tokens or signatures.
 */
import type { D1Like } from "@/lib/chat/store";
import { loadGithubToken, type SealKeys } from "@/lib/connections/credentials";
import type { ProjectRow } from "@/lib/connections/projects";
import { ServiceError } from "@/lib/connections/github-service";
import { safeBranch } from "@/lib/auth/github-policy";
import { startContainerBuild, type BuildBindings } from "@/lib/build/executor";
import { transitionJob } from "@/lib/build/jobs";
import { siteSlug } from "@/lib/hosting/hostnames";

const SHA = /^[a-f0-9]{40}$/i;
const ZERO = /^0{40}$/;
/** Webhook-triggered builds per project per hour (on top of the per-user daily build cap). */
export const WEBHOOK_BUILDS_PER_HOUR = 20;
const PR_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

export interface GitPlan {
  repoId: number;
  branch: string;
  sha: string;
  kind: "push" | "pr";
  prNumber: number | null;
}

export type PlanSkip = { skip: string };

/** Pure: turn a verified event payload into what to build, or why it is ignored. */
export function planFromEvent(event: string, payload: Record<string, unknown>): GitPlan | PlanSkip {
  const repo = payload.repository as { id?: unknown } | undefined;
  const repoId = typeof repo?.id === "number" && Number.isSafeInteger(repo.id) ? repo.id : null;
  if (repoId === null) return { skip: "no_repository" };
  if (event === "push") {
    const ref = typeof payload.ref === "string" ? payload.ref : "";
    if (!ref.startsWith("refs/heads/")) return { skip: "not_a_branch" };
    if (payload.deleted === true) return { skip: "branch_deleted" };
    const sha = typeof payload.after === "string" ? payload.after : "";
    if (!SHA.test(sha) || ZERO.test(sha)) return { skip: "no_commit" };
    const branch = safeBranch(ref.slice("refs/heads/".length));
    if (!branch) return { skip: "bad_branch" };
    return { repoId, branch, sha: sha.toLowerCase(), kind: "push", prNumber: null };
  }
  if (event === "pull_request") {
    const action = typeof payload.action === "string" ? payload.action : "";
    if (!PR_ACTIONS.has(action)) return { skip: `pr_${action || "unknown"}` };
    const pr = payload.pull_request as { number?: unknown; head?: { ref?: unknown; sha?: unknown; repo?: { id?: unknown } | null } } | undefined;
    const head = pr?.head;
    if (!head || head.repo?.id !== repoId) return { skip: "fork_pr" };
    const sha = typeof head.sha === "string" ? head.sha : "";
    const branch = typeof head.ref === "string" ? safeBranch(head.ref) : null;
    if (!SHA.test(sha) || !branch) return { skip: "no_commit" };
    return { repoId, branch, sha: sha.toLowerCase(), kind: "pr", prNumber: typeof pr?.number === "number" ? pr.number : null };
  }
  return { skip: "event_ignored" };
}

const REPO_NAME = /^[\w.-]{1,100}\/[\w.-]{1,100}$/;

function deliveryInstallation(payload: Record<string, unknown>): number | null {
  const id = (payload.installation as { id?: unknown } | undefined)?.id;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Supdev M1: linking a repo is not proof of control (anyone can import a public repo).
 *  - connection bound to an installation → only deliveries from that installation build;
 *  - not bound yet → the importer must have had push/admin on the repo (can_push); a delivery that carries an
 *    installation then binds it (only repo admins can install a GitHub App on a repo);
 *  - otherwise: no auto-deploy.
 */
export function autoDeployAllowed(c: { installation_id: number | null; can_push: number }, installationId: number | null): { ok: true; bind: boolean } | { ok: false; reason: string } {
  if (c.installation_id !== null && c.installation_id !== undefined) {
    return installationId === c.installation_id ? { ok: true, bind: false } : { ok: false, reason: "installation_mismatch" };
  }
  if (c.can_push !== 1) return { ok: false, reason: "no_push_permission" };
  return { ok: true, bind: installationId !== null };
}

/** Atomic hourly counter: one conditional upsert; returns false when the project is over the limit. */
export async function takeWebhookSlot(db: D1Like, projectId: string, now: number, limit = WEBHOOK_BUILDS_PER_HOUR): Promise<boolean> {
  const hour = Math.floor(now / 3_600_000);
  const row = await db
    .prepare("INSERT INTO git_rate (project_id, hour, n) VALUES (?1, ?2, 1) ON CONFLICT (project_id, hour) DO UPDATE SET n = n + 1 WHERE git_rate.n < ?3 RETURNING n")
    .bind(projectId, hour, limit)
    .first<{ n: number }>();
  return !!row;
}

export type CommitState = "pending" | "success" | "failure" | "error";

/** Status context per project, so one repo linked to several projects gets separate checks. */
export const statusContext = (slug: string, environment: "preview" | "production") => `devstack/${slug}/${environment}`;

/** POST a commit status. Best effort: returns false (never throws) so a GitHub outage can't fail the build. */
export async function postCommitStatus(
  token: string,
  repoFullName: string,
  sha: string,
  s: { state: CommitState; url: string | null; context: string; description: string },
  f: typeof fetch = fetch
): Promise<boolean> {
  if (!SHA.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) return false;
  try {
    const res = await f(`https://api.github.com/repos/${repoFullName}/statuses/${sha}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "devstack-bid", "Content-Type": "application/json" },
      body: JSON.stringify({ state: s.state, target_url: s.url && /^https:\/\//.test(s.url) ? s.url : undefined, context: s.context.slice(0, 100), description: s.description.slice(0, 140) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface HandleResult {
  status: string;
  buildJobId?: string;
  deploymentId?: string;
  url?: string | null;
  results?: OneResult[];
}
export interface OneResult { status: string; buildJobId?: string; deploymentId?: string; url?: string | null }

/** "queued:2,rate_limited:1" — one entry per outcome across all linked projects. */
export function aggregateStatus(list: { status: string }[]): string {
  const counts = new Map<string, number>();
  for (const r of list) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${k}:${n}`).join(",");
}

/** Act on one verified, first-seen delivery. Every outcome is a status string recorded on webhook_deliveries. */
export async function handleGitEvent(
  db: D1Like,
  keys: SealKeys,
  b: BuildBindings,
  event: string,
  payload: Record<string, unknown>,
  f: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<HandleResult> {
  const plan = planFromEvent(event, payload);
  if ("skip" in plan) return { status: `ignored:${plan.skip}` };
  const conns = await db
    .prepare("SELECT id, project_id, user_id, installation_id, can_push, repo_full_name FROM project_connections WHERE provider = 'github' AND repo_id = ?1 AND status = 'active'")
    .bind(plan.repoId)
    .all<{ id: string; project_id: string; user_id: string; installation_id: number | null; can_push: number; repo_full_name: string }>();
  const list = conns.results ?? [];
  if (!list.length) return { status: "ignored:not_linked" };
  const installationId = deliveryInstallation(payload);
  const fullName = (payload.repository as { full_name?: unknown } | undefined)?.full_name;
  // One repository can be linked to several projects; build each (bounded).
  const results: OneResult[] = [];
  for (const c of list.slice(0, 5)) {
    const auth = autoDeployAllowed(c, installationId);
    if (!auth.ok) { results.push({ status: `ignored:${auth.reason}` }); continue; }
    if (auth.bind) await db.prepare("UPDATE project_connections SET installation_id = ?2 WHERE id = ?1 AND installation_id IS NULL").bind(c.id, installationId).run();
    // Renamed/transferred repo (same numeric id): follow the new name.
    if (typeof fullName === "string" && REPO_NAME.test(fullName) && fullName !== c.repo_full_name) {
      await db.prepare("UPDATE project_connections SET repo_full_name = ?2 WHERE id = ?1").bind(c.id, fullName).run();
      await db.prepare("UPDATE projects SET repo_full_name = ?2 WHERE id = ?1 AND user_id = ?3").bind(c.project_id, fullName, c.user_id).run();
    }
    results.push(await buildOne(db, keys, b, plan, c.project_id, c.user_id, f, now));
  }
  const first = results[0];
  return { status: aggregateStatus(results), buildJobId: first.buildJobId, deploymentId: first.deploymentId, url: first.url, results };
}

const ACTIVE = "('queued','claimed','installing','building','uploading')";

async function buildOne(db: D1Like, keys: SealKeys, b: BuildBindings, plan: GitPlan, projectId: string, uid: string, f: typeof fetch, now: () => number, fromPending = false): Promise<OneResult> {
  const project = await db.prepare("SELECT * FROM projects WHERE id = ?1 AND user_id = ?2").bind(projectId, uid).first<ProjectRow>();
  if (!project || !project.repo_full_name) return { status: "ignored:project_missing" };
  const slug = siteSlug(project.slug || project.name) || "project";
  const prodBranch = project.production_branch || project.default_branch || "main";
  const environment = plan.kind === "push" && plan.branch === prodBranch ? "production" : "preview";
  const context = statusContext(slug, environment);
  const token = await loadGithubToken(db, keys, uid);
  const report = (sha: string, state: CommitState, url: string | null, description: string) =>
    token ? postCommitStatus(token, project.repo_full_name!, sha, { state, url, context, description }, f) : Promise.resolve(false);
  if (!fromPending) {
    if (!(await takeWebhookSlot(db, projectId, now()))) {
      await report(plan.sha, "failure", null, `Not built: limit of ${WEBHOOK_BUILDS_PER_HOUR} automatic builds per hour reached. Push again later or deploy from devstack.bid.`);
      return { status: "rate_limited" };
    }
  }
  // Newest commit wins: stop older builds in the same slot (production, or this preview branch).
  const slot = environment === "production"
    ? db.prepare(`SELECT id, status, commit_sha FROM build_jobs WHERE project_id = ?1 AND environment = 'production' AND status IN ${ACTIVE}`).bind(projectId)
    : db.prepare(`SELECT id, status, commit_sha FROM build_jobs WHERE project_id = ?1 AND environment = 'preview' AND coalesce(ref, '') = ?2 AND status IN ${ACTIVE}`).bind(projectId, plan.branch);
  const active = (await slot.all<{ id: string; status: string; commit_sha: string | null }>()).results ?? [];
  for (const j of active) {
    if (j.commit_sha === plan.sha) continue;
    const canceled = j.status === "queued" ? await transitionJob(db, j.id, "queued", "canceled", { error_code: "superseded" }, now()) : null;
    if (canceled) {
      await db.prepare("UPDATE deployments SET status = 'failed', error_code = 'superseded', error_log = 'Superseded by a newer commit.', finished_at = ?2 WHERE build_job_id = ?1").bind(j.id, now()).run();
      if (j.commit_sha) await report(j.commit_sha, "failure", null, `Superseded by newer commit ${plan.sha.slice(0, 7)}`);
    } else {
      await db.prepare("UPDATE build_jobs SET cancel_requested = 1 WHERE id = ?1").bind(j.id).run();
    }
  }
  try {
    const r = await startContainerBuild(db, keys, b, uid, project, {
      ref: plan.branch, commit: plan.sha, environment, trigger: plan.kind,
      idempotencyKey: `gh:${environment}:${plan.branch}:${plan.sha}`,
    });
    const url = environment === "production" ? r.productionUrl : r.previewUrl;
    await report(plan.sha, "pending", url, environment === "production" ? "Production build queued" : "Preview build queued");
    return { status: "queued", buildJobId: r.job.id, deploymentId: r.deploymentId, url };
  } catch (e) {
    if (e instanceof ServiceError && e.code === "conflict") {
      // An older build is still stopping: remember only the newest commit for this slot; it starts when that build ends.
      const slotRef = environment === "production" ? "" : plan.branch;
      const prev = await db.prepare("SELECT commit_sha FROM git_pending_builds WHERE project_id = ?1 AND environment = ?2 AND ref = ?3").bind(projectId, environment, slotRef).first<{ commit_sha: string }>();
      if (prev && prev.commit_sha !== plan.sha) await report(prev.commit_sha, "failure", null, `Superseded by newer commit ${plan.sha.slice(0, 7)}`);
      await db.prepare(
        "INSERT INTO git_pending_builds (project_id, user_id, environment, ref, commit_sha, kind, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (project_id, environment, ref) DO UPDATE SET commit_sha = excluded.commit_sha, kind = excluded.kind, user_id = excluded.user_id, updated_at = excluded.updated_at"
      ).bind(projectId, uid, environment, environment === "production" ? "" : plan.branch, plan.sha, plan.kind, now()).run();
      await report(plan.sha, "pending", null, "Waiting: the previous build is stopping; this commit builds next.");
      return { status: "pending" };
    }
    const code = e instanceof ServiceError ? e.code : "internal";
    const msg = e instanceof ServiceError ? e.message.split(" / ")[0] : "Could not start the build.";
    await report(plan.sha, "error", null, msg);
    return { status: `failed:${code}` };
  }
}

/**
 * When a build in a slot ends, start the newest waiting commit for that slot (if any). Never throws.
 * The row is deleted atomically first, so two finishing builds can't both start it.
 */
export async function drainPending(
  db: D1Like, keys: SealKeys, b: BuildBindings,
  job: { project_id: string; environment: "preview" | "production"; ref: string | null },
  f: typeof fetch = fetch, now: () => number = Date.now
): Promise<OneResult | null> {
  try {
    const key = job.environment === "production" ? "" : job.ref ?? "";
    const row = await db.prepare("DELETE FROM git_pending_builds WHERE project_id = ?1 AND environment = ?2 AND ref = ?3 RETURNING *")
      .bind(job.project_id, job.environment, key)
      .first<{ project_id: string; user_id: string; environment: string; ref: string; commit_sha: string; kind: string }>();
    if (!row) return null;
    const conn = await db.prepare("SELECT repo_id FROM project_connections WHERE project_id = ?1 AND provider = 'github' AND status = 'active'").bind(row.project_id).first<{ repo_id: number | null }>();
    if (!conn?.repo_id) return { status: "ignored:not_linked" };
    const project = await db.prepare("SELECT production_branch, default_branch FROM projects WHERE id = ?1").bind(row.project_id).first<{ production_branch: string | null; default_branch: string | null }>();
    const branch = row.environment === "production" ? project?.production_branch || project?.default_branch || "main" : row.ref;
    const kind = row.kind === "pr" ? "pr" : "push";
    return await buildOne(db, keys, b, { repoId: conn.repo_id, branch, sha: row.commit_sha, kind, prNumber: null }, row.project_id, row.user_id, f, now, true);
  } catch {
    return null;
  }
}

/**
 * Cron: start every waiting commit whose slot is free again (covers builds closed by the sweeper, lost queue
 * messages, or anything else that ended without the executor's drain). Never throws.
 */
export async function drainFreeSlots(db: D1Like, keys: SealKeys, b: BuildBindings, f: typeof fetch = fetch, now: () => number = Date.now): Promise<number> {
  let started = 0;
  try {
    const rows = (await db.prepare("SELECT project_id, environment, ref FROM git_pending_builds ORDER BY updated_at LIMIT 20").all<{ project_id: string; environment: "preview" | "production"; ref: string }>()).results ?? [];
    for (const r of rows) {
      const busy = r.environment === "production"
        ? await db.prepare(`SELECT id FROM build_jobs WHERE project_id = ?1 AND environment = 'production' AND status IN ${ACTIVE} LIMIT 1`).bind(r.project_id).first()
        : await db.prepare(`SELECT id FROM build_jobs WHERE project_id = ?1 AND environment = 'preview' AND coalesce(ref, '') = ?2 AND status IN ${ACTIVE} LIMIT 1`).bind(r.project_id, r.ref).first();
      if (busy) continue;
      const res = await drainPending(db, keys, b, { project_id: r.project_id, environment: r.environment, ref: r.ref }, f, now);
      if (res?.status === "queued") started++;
    }
  } catch { /* best effort; next cron run retries */ }
  return started;
}

/**
 * Atomically claim a webhook delivery. New → claimed. Already seen → claimed again only when the earlier attempt
 * never finished (`received`/`redelivered`), failed (`failed:*`), or has been `processing` for over 15 minutes.
 * Re-running is safe: builds are idempotent per (environment, branch, commit).
 */
export async function claimDelivery(db: D1Like, d: { delivery: string; event: string; installationId: number | null; repoId: number | null }, now = Date.now()): Promise<boolean> {
  const row = await db
    .prepare("INSERT INTO webhook_deliveries (delivery_id, provider, event, installation_id, repo_id, signature_ok, status) VALUES (?1, 'github', ?2, ?3, ?4, 1, 'received') ON CONFLICT (delivery_id) DO UPDATE SET status = 'redelivered' WHERE webhook_deliveries.status IN ('received', 'redelivered') OR webhook_deliveries.status LIKE 'failed:%' OR (webhook_deliveries.status = 'processing' AND webhook_deliveries.received_at < ?5) RETURNING delivery_id")
    .bind(d.delivery, d.event, d.installationId, d.repoId, now - 15 * 60_000)
    .first<{ delivery_id: string }>();
  return !!row;
}

/**
 * Called by the executor when a push/pr build finishes: final commit status with the live URL.
 * Only for webhook-triggered jobs; never throws.
 */
export async function reportBuildResult(
  db: D1Like,
  keys: SealKeys,
  job: { user_id: string; project_id: string; commit_sha: string | null; trigger: string; environment: "preview" | "production"; config_snapshot?: string },
  outcome: { ok: boolean; url: string | null; message: string },
  f: typeof fetch = fetch
): Promise<boolean> {
  if ((job.trigger !== "push" && job.trigger !== "pr") || !job.commit_sha) return false;
  try {
    const p = await db.prepare("SELECT repo_full_name, slug, name FROM projects WHERE id = ?1 AND user_id = ?2").bind(job.project_id, job.user_id).first<{ repo_full_name: string | null; slug: string | null; name: string }>();
    const token = await loadGithubToken(db, keys, job.user_id);
    if (!p?.repo_full_name || !token) return false;
    let slug = "";
    try { slug = String((JSON.parse(job.config_snapshot || "{}") as { slug?: unknown }).slug ?? ""); } catch { /* fall through */ }
    slug = slug || siteSlug(p.slug || p.name) || "project";
    return await postCommitStatus(token, p.repo_full_name, job.commit_sha, { state: outcome.ok ? "success" : "failure", url: outcome.url, context: statusContext(slug, job.environment), description: outcome.message }, f);
  } catch {
    return false;
  }
}
