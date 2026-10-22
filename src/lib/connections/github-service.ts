import "server-only";
import {
  commitFiles,
  createBranch,
  createRepo,
  getBranchSha,
  GithubApiError,
  openPullRequest,
  type FileChange,
  type PullSummary,
} from "@/lib/auth/github-api";
import { consume, customerRules } from "@/lib/chat/limits";
import type { D1Like } from "@/lib/chat/store";
import { audit } from "./audit";
import { LIMITS, changeBranchName, safeRepoName } from "./policy";
import { insertProject, type ProjectRow } from "./projects";

export class ServiceError extends Error {
  constructor(
    public code: "rate_limited" | "invalid" | "reauth" | "github" | "conflict" | "forbidden" | "limit" | "blocked",
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const RULES = { repo: LIMITS.reposPerDay, pr: LIMITS.prsPerDay, deploy: LIMITS.deploysPerDay };

export async function takeQuota(db: D1Like, uid: string, kind: "repo" | "pr" | "deploy"): Promise<void> {
  const r = await consume(db, customerRules(uid, kind, RULES));
  if (!r.ok) throw new ServiceError("rate_limited", `Daily ${kind} limit reached (${RULES[kind]}/day). Resets at midnight Bangkok time. / ครบโควตา ${kind} ของวันนี้แล้ว`, 429);
}

/** Create a repo in the customer's account, optionally seed files in one commit, and record a project. */
export async function createProjectRepo(
  db: D1Like,
  token: string,
  uid: string,
  spec: { name: string; private: boolean; templateId?: string | null; description?: string; files?: FileChange[] }
): Promise<{ project: ProjectRow; htmlUrl: string; commit?: string }> {
  const name = safeRepoName(spec.name);
  if (!name) throw new ServiceError("invalid", "Repository name is invalid. / ชื่อ repo ไม่ถูกต้อง");
  await takeQuota(db, uid, "repo");
  const repo = await createRepo(token, { name, private: spec.private, description: spec.description });
  const [owner, rname] = repo.fullName.split("/");
  let commit: string | undefined;
  if (spec.files?.length) commit = (await commitFiles(token, { owner, repo: rname, branch: repo.defaultBranch, message: "chore: scaffold from DevStack", files: spec.files })).sha;
  const project: ProjectRow = { id: crypto.randomUUID(), user_id: uid, name, template_id: spec.templateId ?? null, repo_full_name: repo.fullName, default_branch: repo.defaultBranch, created_at: Date.now() };
  await insertProject(db, { id: project.id, userId: uid, name, templateId: project.template_id, repo: repo.fullName, branch: repo.defaultBranch });
  await audit(db, uid, "project.created", repo.fullName);
  return { project, htmlUrl: repo.htmlUrl, commit };
}

/** Branch from base, commit all files in one Git Data commit, open a PR. The default branch is never written directly. */
export async function proposeChanges(
  db: D1Like,
  token: string,
  uid: string,
  spec: { owner: string; repo: string; base: string; branch?: string; title: string; body: string; files: FileChange[] }
): Promise<{ branch: string; commit: string; pr: PullSummary }> {
  const branch = spec.branch ?? changeBranchName(spec.title);
  if (branch === spec.base) throw new ServiceError("invalid", "Changes go to a new branch, not the base branch. / ต้อง commit ลงสาขาใหม่ ไม่ใช่สาขาหลัก");
  await takeQuota(db, uid, "pr");
  await createBranch(token, spec.owner, spec.repo, branch, spec.base);
  const c = await commitFiles(token, { owner: spec.owner, repo: spec.repo, branch, message: spec.title, files: spec.files });
  const pr = await openPullRequest(token, { owner: spec.owner, repo: spec.repo, head: branch, base: spec.base, title: spec.title, body: `${spec.body}\n\n_Opened by DevStack on your behalf._` });
  await audit(db, uid, "pr.opened", `${spec.owner}/${spec.repo}#${pr.number}`);
  return { branch, commit: c.sha, pr };
}

/** Commit to an existing non-default branch (used by chat edits and self-heal fixes). */
export async function commitToBranch(
  token: string,
  spec: { owner: string; repo: string; branch: string; defaultBranch: string; message: string; files: FileChange[]; createFrom?: string }
): Promise<{ sha: string; url: string }> {
  if (spec.branch === spec.defaultBranch) throw new ServiceError("invalid", "Direct commits to the default branch are blocked; use a branch and a PR. / ห้าม commit ตรงเข้าสาขาหลัก");
  if (!(await getBranchSha(token, spec.owner, spec.repo, spec.branch))) await createBranch(token, spec.owner, spec.repo, spec.branch, spec.createFrom ?? spec.defaultBranch);
  return commitFiles(token, spec);
}

export function serviceErrorBody(err: unknown): { status: number; body: { error: string; code: string } } {
  if (err instanceof ServiceError) return { status: err.status, body: { error: err.message, code: err.code } };
  if (err instanceof GithubApiError) {
    if (err.status === 401) return { status: 401, body: { error: "GitHub rejected the saved sign-in. Reconnect GitHub. / กรุณาเชื่อมต่อ GitHub ใหม่", code: "reauth" } };
    return { status: err.status === 404 || err.status === 409 || err.status === 422 ? err.status : 502, body: { error: err.message, code: "github" } };
  }
  return { status: 502, body: { error: "Request failed. / ทำรายการไม่สำเร็จ", code: "internal" } };
}
