import { getTemplate } from "@/data/templates";
import { TEMPLATE_PROJECTS } from "@/data/template-projects.generated";
import { composeSteps, configForTemplate } from "@/lib/composer";
import { toBash, toReadme } from "@/lib/scripts";
import type { FileChange } from "@/lib/auth/github-api";
import { websiteTheme } from "./website-theme";

/**
 * Files committed to a new repo created from a template on /new.
 * Templates with a complete project in template-projects/ (all /new templates) get that project:
 * package.json, package-lock.json and sources, building to static output (out/ or dist/) on devstack's
 * build container. Other templates get their starter files + setup.sh. Unknown ids get [] (no fallback).
 */

/** Build settings stored on the project so the container builds the right folder. */
export interface TemplateBuild { framework: "nextjs" | "vite"; install: string; build: string; output: string }

export function templateBuild(templateId: string): TemplateBuild | null {
  const files = TEMPLATE_PROJECTS[templateId];
  if (!files) return null;
  const next = files.some((f) => f.path === "next.config.mjs");
  return { framework: next ? "nextjs" : "vite", install: "npm ci", build: "npm run build", output: next ? "out" : "dist" };
}

/** Plain text safe inside HTML text/attributes, JSX text and JS string literals. */
export function safeText(raw: string, max: number): string {
  return raw.replace(/[\u0000-\u001f\u007f<>{}"'`\\$&]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function titleFromName(name: string): string {
  const t = name.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : "My Site";
}

function npmName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "devstack-app";
}

export function templateSeedFiles(templateId: string, repoName: string, description?: string): FileChange[] {
  const template = getTemplate(templateId);
  if (!template) return [];
  const project = TEMPLATE_PROJECTS[templateId];
  if (project) {
    const title = safeText(titleFromName(repoName), 80) || "My Site";
    const desc = safeText(description || template.summary.en, 240);
    const slug = npmName(repoName);
    const th = websiteTheme(repoName, description ?? "");
    const vars: Record<string, string> = {
      __TITLE__: title, __DESCRIPTION__: desc, __SLUG__: slug, __LANG__: /[\u0e00-\u0e7f]/.test(description ?? "") ? "th" : "en",
      __PRIMARY__: th.primary, __PRIMARY_INK__: th.primaryInk, __ACCENT__: th.accent, __BG__: th.bg, __SURFACE__: th.surface,
      __FG__: th.fg, __MUTED__: th.muted, __RADIUS__: th.radius, __FONT__: th.font, __LAYOUT__: th.layout,
    };
    const fill = (s: string) => s.replace(/__[A-Z_]+?__/g, (m) => vars[m] ?? m);
    const out: FileChange[] = project.map((f) => {
      if (f.path === "package.json" || f.path === "package-lock.json") {
        const j = JSON.parse(f.content);
        j.name = slug;
        if (j.packages?.[""]) j.packages[""].name = slug;
        return { path: f.path, content: `${JSON.stringify(j, null, 2)}\n` };
      }
      return { path: f.path, content: fill(f.content) };
    });
    const b = templateBuild(templateId)!;
    out.push({ path: "README.md", content: `# ${title}\n\n${desc}\n\nCreated on devstack.bid from the **${template.name.en}** template.\n\n\`\`\`bash\nnpm ci\nnpm run dev     # local preview\nnpm run build   # static output in ${b.output}/\n\`\`\`\n` });
    return out;
  }
  const config = configForTemplate(templateId, { projectName: repoName });
  const steps = composeSteps(config);
  const files = new Map<string, string>();
  for (const s of steps) for (const f of s.files) if (!/(^|\/)\.env(\.local)?$/.test(f.path)) files.set(f.path, f.content);
  files.set("setup.sh", toBash(steps, config, "en"));
  files.set("README.md", toReadme(steps, config, "en"));
  return [...files].map(([path, content]) => ({ path, content }));
}
