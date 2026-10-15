import type { D1Like } from "@/lib/chat/store";

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  template_id: string | null;
  repo_full_name: string | null;
  default_branch: string | null;
  created_at: number;
}

export async function insertProject(db: D1Like, p: { id: string; userId: string; name: string; templateId: string | null; repo: string; branch: string }): Promise<void> {
  await db
    .prepare("INSERT INTO projects (id, user_id, name, template_id, repo_full_name, default_branch) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(p.id, p.userId, p.name, p.templateId, p.repo, p.branch)
    .run();
}

export async function listProjects(db: D1Like, userId: string): Promise<ProjectRow[]> {
  const r = await db.prepare("SELECT * FROM projects WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100").bind(userId).all<ProjectRow>();
  return r.results ?? [];
}

/** Owner-scoped: another user's project id returns null. */
export async function getProject(db: D1Like, userId: string, id: string): Promise<ProjectRow | null> {
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return null;
  return db.prepare("SELECT * FROM projects WHERE id = ?1 AND user_id = ?2").bind(id, userId).first<ProjectRow>();
}

export async function findProjectByRepo(db: D1Like, userId: string, repo: string): Promise<ProjectRow | null> {
  return db.prepare("SELECT * FROM projects WHERE user_id = ?1 AND repo_full_name = ?2").bind(userId, repo).first<ProjectRow>();
}

export const projectView = (p: ProjectRow) => ({
  id: p.id,
  name: p.name,
  templateId: p.template_id,
  repo: p.repo_full_name,
  defaultBranch: p.default_branch,
  repoUrl: p.repo_full_name ? `https://github.com/${p.repo_full_name}` : null,
  createdAt: p.created_at,
});
