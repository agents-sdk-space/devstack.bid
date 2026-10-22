import { getTemplate } from "@/data/templates";
import { composeSteps, configForTemplate } from "@/lib/composer";
import { toBash, toReadme } from "@/lib/scripts";
import type { FileChange } from "@/lib/auth/github-api";

/**
 * Files committed to a new repo created from a template on /new. Before this, POST /api/projects with
 * only a templateId created an auto_init repo holding just GitHub's README, so every template produced the
 * same repo (and the same build result). This seeds the template's own starter files plus its setup.sh
 * and README, so each template's repo is distinct. Returns [] for unknown ids (never falls back to
 * TEMPLATES[0]).
 */
export function templateSeedFiles(templateId: string, repoName: string): FileChange[] {
  if (!getTemplate(templateId)) return [];
  const config = configForTemplate(templateId, { projectName: repoName });
  const steps = composeSteps(config);
  const files = new Map<string, string>();
  for (const s of steps) for (const f of s.files) if (!/(^|\/)\.env(\.local)?$/.test(f.path)) files.set(f.path, f.content);
  files.set("setup.sh", toBash(steps, config, "en"));
  files.set("README.md", toReadme(steps, config, "en"));
  return [...files].map(([path, content]) => ({ path, content }));
}
