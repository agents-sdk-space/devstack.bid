"use client";

import { useEffect, useState } from "react";
import { FolderGit2, Plus } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { UploadZipPanel } from "./upload-zip-panel";
import { useLang } from "@/components/prefs";

type Project = { id: string; name: string; repo: string | null; repoUrl: string | null; templateId: string | null; createdAt: number };

async function load(): Promise<Project[]> {
  const r = await fetch("/api/projects", { cache: "no-store" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Could not load projects");
  return b.projects ?? [];
}

/** /projects — repos DevStack created in the customer's GitHub. */
export function ProjectsList() {
  const { lang } = useLang();
  const th = lang === "th";
  const [items, setItems] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    load().then((x) => on && setItems(x)).catch((e: unknown) => on && setError(e instanceof Error ? e.message : String(e)));
    return () => { on = false; };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, private: priv }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Failed");
      window.location.href = `/projects/${b.project.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{th ? "โปรเจกต์" : "Projects"}</h1>
      <p className="mt-1 text-sm text-subtle">{th ? "repo ที่ DevStack สร้างในบัญชี GitHub ของคุณ (มีโควตารายวัน)" : "Repositories DevStack created in your GitHub account (daily quota applies)."}{" "}<a href="/settings/cli" className="underline underline-offset-4 hover:text-fg">{th ? "หรือสร้างจาก Terminal / ดาวน์โหลด zip" : "Or start from Terminal / download a zip"}</a></p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-fg/40 px-3 py-2 text-sm text-fg">{error}</p>}
      <UploadZipPanel onDone={(id) => { location.href = `/projects/${encodeURIComponent(id)}`; }} />
      <Card className="mt-6 p-5">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm font-medium text-fg">
            {th ? "ชื่อ repo ใหม่" : "New repository name"}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-fg" placeholder="my-app" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-fg"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="accent-current" />{th ? "ส่วนตัว" : "Private"}</label>
          <button disabled={busy || !name} className={buttonClasses("primary", "md")}><Plus className="h-4 w-4" aria-hidden />{th ? "สร้าง repo" : "Create repo"}</button>
        </form>
      </Card>
      <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
        {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-subtle">{th ? "ยังไม่มีโปรเจกต์" : "No projects yet."}</li>}
        {items.map((p) => (
          <li key={p.id}>
            <a href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg">
              <FolderGit2 className="h-4 w-4 text-subtle" aria-hidden />
              <span className="font-medium text-fg">{p.name}</span>
              <span className="ml-auto font-mono text-xs text-subtle">{p.repo}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
