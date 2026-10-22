/**
 * Import an EXISTING GitHub repository as a DevStack project (no repo copy is created).
 * Read-only on GitHub: repo metadata, branches, tree, package.json. Writes only to D1 (owner-scoped).
 */
import { GithubApiError, getRepoMeta, listBranches, readFile, readTree } from "@/lib/auth/github-api";
import { parseRepo, safeBranch } from "@/lib/auth/github-policy";
import type { D1Like } from "@/lib/chat/store";
import { audit } from "@/lib/connections/audit";
import { ServiceError } from "@/lib/connections/github-service";
import type { ProjectRow } from "@/lib/connections/projects";
import { candidateRoots, detectFramework, underRoot, validateBuildConfig, validateRootDirectory, validateSlug, type FrameworkPreset } from "./config";

export const MAX_PROJECTS_PER_USER = 100;

export interface GithubReader {
  getRepoMeta: typeof getRepoMeta;
  listBranches: typeof listBranches;
  readTree: typeof readTree;
  readFile: typeof readFile;
}
export const githubReader: GithubReader = { getRepoMeta, listBranches, readTree, readFile };

function repoParts(raw: unknown): { owner: string; name: string } {
  const r = typeof raw === "string" ? parseRepo(raw.trim()) : null;
  if (!r) throw new ServiceError("invalid", "Repository must look like owner/name. / รูปแบบ repo ต้องเป็น owner/name", 400);
  return r;
}

function mapGithub(err: unknown): never {
  if (err instanceof GithubApiError) {
    if (err.status === 401) throw new ServiceError("reauth", "GitHub sign-in expired. Reconnect GitHub. / การเชื่อมต่อ GitHub หมดอายุ", 401);
    if (err.status === 403 || err.status === 404) throw new ServiceError("forbidden", "DevStack can't read this repository. Grant access on GitHub (OAuth app or org approval) and retry. / ไม่มีสิทธิ์อ่าน repo นี้", 403);
  }
  throw err;
}

async function readPkg(gh: GithubReader, token: string, owner: string, name: string, root: string, ref: string) {
  const f = await gh.readFile(token, owner, name, root ? `${root}/package.json` : "package.json", ref).catch(() => null);
  if (!f) return null;
  try { return JSON.parse(f.content) as Parameters<typeof detectFramework>[1]; } catch { return null; }
}

/** GET /api/github/inspect — branches, candidate roots and the detected framework for one root. */
export async function inspectRepo(token: string, input: { repo: unknown; ref?: unknown; root?: unknown }, gh: GithubReader = githubReader) {
  const { owner, name } = repoParts(input.repo);
  try {
    const meta = await gh.getRepoMeta(token, owner, name);
    const ref = typeof input.ref === "string" && input.ref ? safeBranch(input.ref) : meta.defaultBranch;
    if (!ref) throw new ServiceError("invalid", "Invalid branch. / ชื่อ branch ไม่ถูกต้อง", 400);
    const root = validateRootDirectory(input.root);
    if (root === null) throw new ServiceError("invalid", "Invalid root directory. / root directory ไม่ถูกต้อง", 400);
    const [branches, tree] = await Promise.all([gh.listBranches(token, owner, name), gh.readTree(token, owner, name, ref)]);
    const paths = tree.entries.filter((e) => e.type === "blob").map((e) => e.path);
    const framework: FrameworkPreset = detectFramework(underRoot(paths, root), await readPkg(gh, token, owner, name, root, ref));
    return { repo: meta.fullName, private: meta.private, defaultBranch: meta.defaultBranch, ref, branches, roots: candidateRoots(paths), root, framework, truncated: tree.truncated };
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    mapGithub(err);
  }
}

/** POST /api/projects/import — validate everything against GitHub, then persist project + connection in one batch. */
export async function importRepo(
  db: D1Like,
  token: string,
  uid: string,
  body: { repo?: unknown; branch?: unknown; rootDirectory?: unknown; name?: unknown; build?: unknown },
  gh: GithubReader = githubReader
): Promise<ProjectRow> {
  const { owner, name } = repoParts(body.repo);
  const slugV = validateSlug(body.name ?? name);
  if (!slugV.ok) throw new ServiceError("invalid", slugV.error, 400);
  const root = validateRootDirectory(body.rootDirectory);
  if (root === null) throw new ServiceError("invalid", "Invalid root directory. / root directory ไม่ถูกต้อง", 400);
  const cfgV = validateBuildConfig(body.build);
  if (!cfgV.ok) throw new ServiceError("invalid", cfgV.error, 400);

  let meta: Awaited<ReturnType<typeof getRepoMeta>>;
  let branch: string;
  try {
    meta = await gh.getRepoMeta(token, owner, name);
    const b = typeof body.branch === "string" && body.branch ? safeBranch(body.branch) : meta.defaultBranch;
    if (!b) throw new ServiceError("invalid", "Invalid branch. / ชื่อ branch ไม่ถูกต้อง", 400);
    branch = b;
    const tree = await gh.readTree(token, owner, name, branch);
    if (root && !tree.entries.some((e) => e.path.startsWith(`${root}/`))) throw new ServiceError("invalid", `Root directory "${root}" not found on ${branch}. / ไม่พบโฟลเดอร์นี้`, 422);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    mapGithub(err);
  }

  const count = await db.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?1").bind(uid).first<{ n: number }>();
  if (Number(count?.n ?? 0) >= MAX_PROJECTS_PER_USER) throw new ServiceError("limit", `Project limit reached (${MAX_PROJECTS_PER_USER}).`, 409);
  const dupe = await db.prepare("SELECT id FROM projects WHERE user_id = ?1 AND repo_full_name = ?2 AND root_directory = ?3").bind(uid, meta!.fullName, root).first<{ id: string }>();
  if (dupe) throw new ServiceError("conflict", "This repository (and root) is already a project. / repo นี้ถูกนำเข้าแล้ว", 409);
  const slugTaken = await db.prepare("SELECT id FROM projects WHERE slug = ?1").bind(slugV.slug).first<{ id: string }>();
  // <existing-slug>-<6 chars> is the preview hostname shape of another project: never hand it out.
  const previewShape = /^(.+)-[a-z0-9]{6}$/.exec(slugV.slug);
  if (previewShape && (await db.prepare("SELECT id FROM projects WHERE slug = ?1").bind(previewShape[1]).first<{ id: string }>()))
    throw new ServiceError("conflict", `Project name "${slugV.slug}" looks like a preview address of another project. / ชื่อนี้ซ้ำกับรูปแบบลิงก์ preview`, 409);
  if (slugTaken) throw new ServiceError("conflict", `Project name "${slugV.slug}" is already used. / ชื่อนี้ถูกใช้แล้ว`, 409);

  const c = cfgV.config;
  const id = crypto.randomUUID();
  const now = Date.now();
  // Slugs are globally unique (migration 0017): they become <slug>.devstack.bid. A lost race maps to 409.
  await db.batch([
    db.prepare(
      "INSERT INTO projects (id, user_id, name, template_id, repo_full_name, default_branch, slug, source, root_directory, framework, install_command, build_command, output_directory, node_version, production_branch, provider, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, 'github_import', ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'cloudflare', ?14)"
    ).bind(id, uid, slugV.slug, meta!.fullName, branch!, slugV.slug, root, c.framework, c.installCommand, c.buildCommand, c.outputDirectory, c.nodeVersion, branch!, now),
    db.prepare("INSERT INTO project_connections (id, project_id, user_id, provider, installation_id, repo_id, repo_full_name, private, can_push) VALUES (?1, ?2, ?3, 'github', NULL, ?4, ?5, ?6, ?7)")
      .bind(crypto.randomUUID(), id, uid, meta!.id, meta!.fullName, meta!.private ? 1 : 0, meta!.canPush ? 1 : 0),
  ]).catch((e: unknown) => {
    if (/UNIQUE/i.test(String((e as Error)?.message)) && /slug/i.test(String((e as Error)?.message))) throw new ServiceError("conflict", `Project name "${slugV.slug}" is already used. / ชื่อนี้ถูกใช้แล้ว`, 409);
    throw e;
  });
  await audit(db, uid, "project.imported", `${meta!.fullName}${root ? `/${root}` : ""}@${branch!}`);
  return {
    id, user_id: uid, name: slugV.slug, template_id: null, repo_full_name: meta!.fullName, default_branch: branch!, created_at: now,
    slug: slugV.slug, source: "github_import", root_directory: root, framework: c.framework, install_command: c.installCommand,
    build_command: c.buildCommand, output_directory: c.outputDirectory, node_version: c.nodeVersion, production_branch: branch!, provider: "cloudflare",
  };
}
