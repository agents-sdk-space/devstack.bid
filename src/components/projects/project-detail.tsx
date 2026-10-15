"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { Card } from "@/components/ui";
import { useLang } from "@/components/prefs";
import type { DeployProfile } from "@/lib/deploy/templates";

export type ProjectView = { id: string; name: string; repo: string | null; repoUrl: string | null; defaultBranch: string | null; templateId: string | null };
type Pull = { number: number; title: string; state: string; url: string; head: string; base: string };

/** /projects/[id] — repo link and pull requests. Deploy sections are added below (PR-C/D). */
export function ProjectDetail({ id, children }: { id: string; children?: (p: ProjectView, extra: { profile: DeployProfile | null; repoPrivate: boolean | null }) => React.ReactNode }) {
  const { lang } = useLang();
  const th = lang === "th";
  const [project, setProject] = useState<ProjectView | null>(null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState<{ profile: DeployProfile | null; repoPrivate: boolean | null }>({ profile: null, repoPrivate: null });

  useEffect(() => {
    let on = true;
    fetch(`/api/projects/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Not found");
        if (on) { setProject(b.project); setPulls(b.pulls ?? []); setExtra({ profile: b.profile ?? null, repoPrivate: b.repoPrivate ?? null }); }
      })
      .catch((e: unknown) => on && setError(e instanceof Error ? e.message : String(e)));
    return () => { on = false; };
  }, [id]);

  if (error) return <p role="alert" className="mx-auto max-w-4xl px-4 py-10 text-sm text-fg">{error}</p>;
  if (!project) return <p className="mx-auto max-w-4xl px-4 py-10 text-sm text-subtle">…</p>;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <a href="/projects" className="text-xs text-subtle hover:text-fg">← {th ? "โปรเจกต์" : "Projects"}</a>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{project.name}</h1>
      {project.repoUrl && (
        <a href={project.repoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-subtle hover:text-fg">
          {project.repo} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold text-fg">Pull requests</h2>
        <ul className="mt-3 space-y-2">
          {pulls.length === 0 && <li className="text-sm text-subtle">{th ? "ยังไม่มี PR — ให้แชตเปิด PR ให้ได้" : "No pull requests yet — ask the chat to open one."}</li>}
          {pulls.map((p) => (
            <li key={p.number} className="flex items-center gap-2 text-sm">
              <GitPullRequest className="h-4 w-4 text-subtle" aria-hidden />
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-fg hover:underline">#{p.number} {p.title}</a>
              <span className="ml-auto rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-subtle">{p.state}</span>
            </li>
          ))}
        </ul>
      </Card>
      {children?.(project, extra)}
    </div>
  );
}
