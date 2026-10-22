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

export type CommitState = "pending" | "success" | "failure" | "error";

/** POST a commit status. Best effort: returns false (never throws) so a GitHub outage can't fail the build. */
export async function postCommitStatus(
  token: string,
  repoFullName: string,
  sha: string,
  s: { state: CommitState; url: string | null; environment: "preview" | "production"; description: string },
  f: typeof fetch = fetch
): Promise<boolean> {
  if (!SHA.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repoFullName)) return false;
  try {
    const res = await f(`https://api.github.com/repos/${repoFullName}/statuses/${sha}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "devstack-bid", "Content-Type": "application/json" },
      body: JSON.stringify({ state: s.state, target_url: s.url && /^https:\/\//.test(s.url) ? s.url : undefined, context: `devstack/${s.environment}`, description: s.description.slice(0, 140) }),
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
    .prepare("SELECT project_id, user_id FROM project_connections WHERE provider = 'github' AND repo_id = ?1 AND status = 'active'")
    .bind(plan.repoId)
    .all<{ project_id: string; user_id: string }>();
  const list = conns.results ?? [];
  if (!list.length) return { status: "ignored:not_linked" };
  // One repository can be linked to several projects; build each (bounded).
  let last: HandleResult = { status: "ignored:not_linked" };
  for (const c of list.slice(0, 5)) last = await buildOne(db, keys, b, plan, c.project_id, c.user_id, f, now);
  return last;
}

async function buildOne(db: D1Like, keys: SealKeys, b: BuildBindings, plan: GitPlan, projectId: string, uid: string, f: typeof fetch, now: () => number): Promise<HandleResult> {
  const project = await db.prepare("SELECT * FROM projects WHERE id = ?1 AND user_id = ?2").bind(projectId, uid).first<ProjectRow>();
  if (!project || !project.repo_full_name) return { status: "ignored:project_missing" };
  const prodBranch = project.production_branch || project.default_branch || "main";
  const environment = plan.kind === "push" && plan.branch === prodBranch ? "production" : "preview";
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM build_jobs WHERE project_id = ?1 AND trigger IN ('push','pr') AND created_at > ?2")
    .bind(projectId, now() - 3_600_000)
    .first<{ n: number }>();
  const token = await loadGithubToken(db, keys, uid);
  const report = (state: CommitState, url: string | null, description: string) =>
    token ? postCommitStatus(token, project.repo_full_name!, plan.sha, { state, url, environment, description }, f) : Promise.resolve(false);
  if ((recent?.n ?? 0) >= WEBHOOK_BUILDS_PER_HOUR) {
    await report("error", null, `Skipped: more than ${WEBHOOK_BUILDS_PER_HOUR} automatic builds this hour.`);
    return { status: "rate_limited" };
  }
  try {
    const r = await startContainerBuild(db, keys, b, uid, project, {
      ref: plan.branch, commit: plan.sha, environment, trigger: plan.kind,
      idempotencyKey: `gh:${environment}:${plan.branch}:${plan.sha}`,
    });
    const url = environment === "production" ? r.productionUrl : r.previewUrl;
    await report("pending", url, environment === "production" ? "Production build queued" : "Preview build queued");
    return { status: "queued", buildJobId: r.job.id, deploymentId: r.deploymentId, url };
  } catch (e) {
    const code = e instanceof ServiceError ? e.code : "internal";
    const msg = e instanceof ServiceError ? e.message.split(" / ")[0] : "Could not start the build.";
    await report("error", null, msg);
    return { status: `failed:${code}` };
  }
}

/**
 * Called by the executor when a push/pr build finishes: final commit status with the live URL.
 * Only for webhook-triggered jobs; never throws.
 */
export async function reportBuildResult(
  db: D1Like,
  keys: SealKeys,
  job: { user_id: string; project_id: string; commit_sha: string | null; trigger: string; environment: "preview" | "production" },
  outcome: { ok: boolean; url: string | null; message: string },
  f: typeof fetch = fetch
): Promise<boolean> {
  if ((job.trigger !== "push" && job.trigger !== "pr") || !job.commit_sha) return false;
  try {
    const p = await db.prepare("SELECT repo_full_name FROM projects WHERE id = ?1 AND user_id = ?2").bind(job.project_id, job.user_id).first<{ repo_full_name: string | null }>();
    const token = await loadGithubToken(db, keys, job.user_id);
    if (!p?.repo_full_name || !token) return false;
    return await postCommitStatus(token, p.repo_full_name, job.commit_sha, { state: outcome.ok ? "success" : "failure", url: outcome.url, environment: job.environment, description: outcome.message }, f);
  } catch {
    return false;
  }
}
