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
import { findProjectByRepo, projectView } from "@/lib/connections/projects";
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
  const token = await loadGithubToken(ctx.db, ctx.keys, ctx.uid);
  if (!token) throw new CustomerToolError("The user has not connected GitHub. Ask them to sign in with GitHub at /settings/connections, then retry.");
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
    case "github_get_pull_request": {
      const r = repoOf(args);
      const n = Number(args.number);
      if (!Number.isInteger(n) || n < 1) throw new CustomerToolError("Invalid PR number.");
      return getPullRequest(token, r.owner, r.name, n);
    }
  }
  throw new CustomerToolError(`Unknown function ${name}`);
}
