/** Export the current AI site snapshot to a GitHub repo the user already has (reuses putFile; one commit per file). */
import { putFile } from "@/lib/auth/github-api";
import { parseRepo, safeBranch } from "@/lib/auth/github-policy";
import { ServiceError } from "@/lib/connections/github-service";
import type { SiteFileText } from "./files";

export async function exportToGithub(token: string, input: { repo: unknown; branch?: unknown }, files: SiteFileText[], version: number, put: typeof putFile = putFile) {
  const r = typeof input.repo === "string" ? parseRepo(input.repo.trim()) : null;
  if (!r) throw new ServiceError("invalid", "Repository must look like owner/name. / รูปแบบ repo ต้องเป็น owner/name", 400);
  const branch = safeBranch(typeof input.branch === "string" && input.branch ? input.branch : "main");
  if (!branch) throw new ServiceError("invalid", "Invalid branch. / ชื่อ branch ไม่ถูกต้อง", 400);
  const out: { path: string; commit: string }[] = [];
  for (const f of files) {
    const res = await put(token, { owner: r.owner, repo: r.name, path: f.path, branch, message: `devstack: AI site v${version} ${f.path}`, content: f.content });
    out.push({ path: f.path, commit: res.commit });
  }
  return { repo: `${r.owner}/${r.name}`, branch, files: out.length, lastCommit: out.at(-1)?.commit ?? null };
}
