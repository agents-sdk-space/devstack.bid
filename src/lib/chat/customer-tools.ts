import "server-only";
import {
  createBranch,
  getPullRequest,
  listPullRequests,
  listWritableRepos,
  openPullRequest,
  readFile,
  readTree,
} from "@/lib/auth/github-api";
import { parseRepo, safeBranch, safeCommitMessage, safeRepoPath } from "@/lib/auth/github-policy";
import { audit } from "@/lib/connections/audit";
import { loadGithubToken, type SealKeys } from "@/lib/connections/credentials";
import { commitToBranch, createProjectRepo, takeQuota } from "@/lib/connections/github-service";
import { validateChangeSet } from "@/lib/connections/policy";
import { findProjectByRepo, getProject, projectView } from "@/lib/connections/projects";
import { LIMITS } from "@/lib/connections/policy";
import { patchProjectFiles, scanSecrets } from "@/lib/deploy/upload";
import { ERROR_HINTS, deploymentView, getDeployment, latestFailed, recordFixAttempt } from "@/lib/deploy/service";
import type { DeployCardData, UiEvent } from "./events";
import type { D1Like } from "./store";
export { CUSTOMER_GITHUB_TOOLS, CUSTOMER_TOOL_NAMES } from "./customer-tool-defs";

/**
 * Chat agent tools that act on the CUSTOMER's own GitHub account (their OAuth token, sealed in D1).
 * Writes never touch the default branch directly (branch + PR), never .github/workflows, and are
 * capped per user per day. Tool output never includes a token.
 */

export class CustomerToolError extends Error {}

export interface CustomerCtx {
  db: D1Like;
  uid: string;
  keys: SealKeys;
  emit?: (e: UiEvent) => void;
}

export function deployCard(v: ReturnType<typeof deploymentView>, repo: string | null): DeployCardData {
  return {
    id: v.id,
    projectId: v.projectId,
    repo,
    status: v.status,
    url: v.url,
    errorCode: v.errorCode,
    fixAttempts: v.fixAttempts,
    maxFixAttempts: v.maxFixAttempts,
    retryRef: v.ref,
    canRetry: false,
  };
}

function repoOf(args: Record<string, unknown>) {
  const r = typeof args.repo === "string" ? parseRepo(args.repo) : null;
  if (!r) throw new CustomerToolError("Invalid repo; use owner/name.");
  return r;
}
function branchOf(v: unknown, what = "branch") {
  const b = typeof v === "string" ? safeBranch(v) : null;
  if (!b) throw new CustomerToolError(`Invalid ${what}.`);
  return b;
}

async function defaultBranch(token: string, owner: string, name: string): Promise<string> {
  const repos = await listWritableRepos(token);
  const hit = repos.find((r) => r.fullName.toLowerCase() === `${owner}/${name}`.toLowerCase());
  if (!hit) throw new CustomerToolError("The customer cannot push to that repository.");
  return hit.defaultBranch;
}

export async function runCustomerTool(name: string, args: Record<string, unknown>, ctx: CustomerCtx): Promise<unknown> {
  const token = (await loadGithubToken(ctx.db, ctx.keys, ctx.uid)) ?? "";
  if (!token && name !== "get_deploy_logs" && name !== "apply_fix") throw new CustomerToolError("The user has not connected GitHub. Ask them to sign in with GitHub at /settings/connections, then retry.");
  switch (name) {
    case "github_list_repositories":
      return listWritableRepos(token);
    case "github_read_tree": {
      const r = repoOf(args);
      return readTree(token, r.owner, r.name, branchOf(args.ref, "ref"));
    }
    case "github_read_file": {
      const r = repoOf(args);
      const path = typeof args.path === "string" ? safeRepoPath(args.path) : null; // reads may include .github/workflows
      if (!path) throw new CustomerToolError("Invalid path.");
      const f = await readFile(token, r.owner, r.name, path, branchOf(args.ref, "ref"));
      if (!f) throw new CustomerToolError("File not found.");
      return { path, sha: f.sha, content: f.content.slice(0, 60_000), truncated: f.content.length > 60_000 };
    }
    case "github_create_repo": {
      let files;
      if (args.files !== undefined) {
        const v = validateChangeSet(args.files);
        if (!v.ok) throw new CustomerToolError(`Files rejected: ${v.error}${v.path ? ` (${v.path})` : ""}`);
        files = v.files;
      }
      const res = await createProjectRepo(ctx.db, token, ctx.uid, { name: String(args.name ?? ""), private: args.private !== false, description: typeof args.description === "string" ? args.description : undefined, files });
      return { project: projectView(res.project), url: res.htmlUrl, commit: res.commit ?? null };
    }
    case "github_create_branch": {
      const r = repoOf(args);
      const sha = await createBranch(token, r.owner, r.name, branchOf(args.branch), branchOf(args.from, "from"));
      return { branch: args.branch, from: args.from, sha };
    }
    case "github_write_files": {
      const r = repoOf(args);
      const branch = branchOf(args.branch);
      const message = typeof args.message === "string" ? safeCommitMessage(args.message) : null;
      if (!message) throw new CustomerToolError("Invalid commit message.");
      const v = validateChangeSet(args.files);
      if (!v.ok) throw new CustomerToolError(`Files rejected: ${v.error}${v.path ? ` (${v.path})` : ""}`);
      const def = (await findProjectByRepo(ctx.db, ctx.uid, `${r.owner}/${r.name}`).catch(() => null))?.default_branch ?? (await defaultBranch(token, r.owner, r.name));
      const c = await commitToBranch(token, { owner: r.owner, repo: r.name, branch, defaultBranch: def, message, files: v.files, createFrom: typeof args.from === "string" ? branchOf(args.from, "from") : def });
      return { branch, commit: c.sha, url: c.url, files: v.files.map((f) => ({ path: f.path, deleted: f.content === null })) };
    }
    case "github_open_pull_request": {
      const r = repoOf(args);
      const title = typeof args.title === "string" ? safeCommitMessage(args.title) : null;
      if (!title) throw new CustomerToolError("Invalid title.");
      await takeQuota(ctx.db, ctx.uid, "pr");
      const pr = await openPullRequest(token, { owner: r.owner, repo: r.name, head: branchOf(args.head, "head"), base: branchOf(args.base, "base"), title, body: `${String(args.body ?? "")}\n\n_Opened by DevStack on your behalf._` });
      await audit(ctx.db, ctx.uid, "pr.opened", `${r.owner}/${r.name}#${pr.number}`);
      return pr;
    }
    case "github_list_pull_requests": {
      const r = repoOf(args);
      const state = args.state === "closed" || args.state === "all" ? args.state : "open";
      return listPullRequests(token, r.owner, r.name, state);
    }
    case "get_deploy_logs": {
      const d = typeof args.deployment_id === "string" && args.deployment_id ? await getDeployment(ctx.db, ctx.uid, args.deployment_id) : await latestFailed(ctx.db, ctx.uid);
      if (!d) throw new CustomerToolError("No failed deployment found for this user.");
      const project = await getProject(ctx.db, ctx.uid, d.project_id);
      const view = deploymentView(d);
      ctx.emit?.({ t: "deploy", d: { ...deployCard(view, project?.repo_full_name ?? null) } });
      return { ...view, hint: d.error_code ? ERROR_HINTS[d.error_code] ?? null : null, repo: project?.repo_full_name, defaultBranch: project?.default_branch, templateId: project?.template_id, remainingFixAttempts: Math.max(0, LIMITS.maxFixAttempts - d.fix_attempts) };
    }
    case "apply_fix": {
      const id = typeof args.deployment_id === "string" ? args.deployment_id : "";
      const d = await getDeployment(ctx.db, ctx.uid, id);
      if (!d) throw new CustomerToolError("Deployment not found.");
      if (d.status !== "failed") throw new CustomerToolError("Only failed deployments can be fixed.");
      const project = await getProject(ctx.db, ctx.uid, d.project_id);
      if (!project) throw new CustomerToolError("Project not found.");
      const message = typeof args.message === "string" ? safeCommitMessage(args.message) : null;
      if (!message) throw new CustomerToolError("Invalid commit message.");
      const v = validateChangeSet(args.files);
      if (!v.ok) throw new CustomerToolError(`Files rejected: ${v.error}${v.path ? ` (${v.path})` : ""}`);
      if (project.repo_full_name && !token) throw new CustomerToolError("The user has not connected GitHub. Ask them to sign in with GitHub at /settings/connections, then retry.");
      if (!project.repo_full_name) for (const f of v.files) if (f.content !== null && scanSecrets(f.path, new TextEncoder().encode(f.content))) throw new CustomerToolError(`Refusing to write a secret into ${f.path}. Use Worker secrets.`);
      const attempt = await recordFixAttempt(ctx.db, ctx.uid, id);
      if (attempt === null) throw new CustomerToolError(`Fix limit reached (${LIMITS.maxFixAttempts} attempts). Stop and tell the user what to change manually.`);
      if (!project.repo_full_name) {
        await patchProjectFiles(ctx.db, project.id, v.files);
        await audit(ctx.db, ctx.uid, "fix.committed", `${id}:${attempt}`);
        ctx.emit?.({ t: "activity", a: { id: `fix:${id}:${attempt}`, kind: "tool", label: `Self-heal attempt ${attempt}/${LIMITS.maxFixAttempts}`, detail: `${v.files.length} file(s) → uploaded project`, status: "done", at: Date.now() } });
        ctx.emit?.({ t: "deploy", d: { ...deployCard(deploymentView(d), null), fixAttempts: attempt, retryRef: null, canRetry: true } });
        return { attempt, maxAttempts: LIMITS.maxFixAttempts, note: "Fix saved to the uploaded project files. Ask the user to click 'Retry deploy' (you cannot redeploy yourself)." };
      }
      const [owner, repo] = project.repo_full_name.split("/");
      const def = project.default_branch ?? "main";
      const branch = d.ref && d.ref !== def ? d.ref : `devstack/fix-${id.slice(0, 8)}`;
      const c = await commitToBranch(token, { owner, repo, branch, defaultBranch: def, message: `${message} (fix ${attempt}/${LIMITS.maxFixAttempts})`, files: v.files, createFrom: d.ref ?? def });
      await audit(ctx.db, ctx.uid, "fix.committed", `${id}:${attempt}`);
      const card = deployCard(deploymentView(d), project.repo_full_name);
      ctx.emit?.({ t: "activity", a: { id: `fix:${id}:${attempt}`, kind: "tool", label: `Self-heal attempt ${attempt}/${LIMITS.maxFixAttempts}`, detail: `${v.files.length} file(s) → ${branch}`, status: "done", at: Date.now() } });
      ctx.emit?.({ t: "deploy", d: { ...card, fixAttempts: attempt, retryRef: branch, canRetry: true } });
      return { branch, commit: c.sha, attempt, maxAttempts: LIMITS.maxFixAttempts, note: "Fix committed. Ask the user to click 'Retry deploy' (you cannot redeploy yourself)." };
    }
    case "github_get_pull_request": {
      const r = repoOf(args);
      const n = Number(args.number);
      if (!Number.isInteger(n) || n < 1) throw new CustomerToolError("Invalid PR number.");
      return getPullRequest(token, r.owner, r.name, n);
    }
  }
  throw new CustomerToolError(`Unknown function ${name}`);
}
