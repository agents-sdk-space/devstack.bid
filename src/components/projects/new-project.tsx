"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderGit2, GitBranch, Lock, RefreshCw, Search } from "lucide-react";
import { Badge, buttonClasses, Card, EmptyState, Input, Label, Segmented, Select, Skeleton, Spinner } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { UploadZipPanel } from "./upload-zip-panel";
import { githubConnectHref } from "@/lib/auth/github-policy";

export type TemplateOption = { id: string; name: { en: string; th: string }; target: string };
type Repo = { id: number; fullName: string; owner: string; private: boolean; defaultBranch: string; updatedAt: string | null };
type Framework = { id: string; label: string; install: string | null; build: string | null; output: string | null };
type Inspect = { repo: string; private: boolean; defaultBranch: string; ref: string; branches: string[]; roots: string[]; root: string; framework: Framework; truncated: boolean };
type ListState = { kind: "loading" } | { kind: "ok"; repos: Repo[]; hasMore: boolean; page: number } | { kind: "reauth"; message: string } | { kind: "denied"; message: string } | { kind: "error"; message: string };
type Mode = "git" | "upload" | "template";

const MODES: readonly Mode[] = ["git", "upload", "template"];
export function isMode(v: string | null): v is Mode {
  return v !== null && (MODES as readonly string[]).includes(v);
}

/** Connect-GitHub link that returns to this exact page (path + query), same-origin only. */
function ConnectLink({ className, children }: { className: string; children: React.ReactNode }) {
  return <a href={githubConnectHref("/new")} className={className} onClick={(e) => { e.currentTarget.href = githubConnectHref(`${location.pathname}${location.search}`); }}>{children}</a>;
}

/** Same rule as the server (safeWorkerName / validateSlug): lowercase, digits, inner dashes, 1–63. */
export const SLUG_PATTERN = "[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?";
export function suggestName(repoName: string): string {
  return repoName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/, "");
}

/** Keep fields the user edited; fill the rest from detection. */
export function mergeDetected(cur: { install: string; build: string; output: string }, touched: { install?: boolean; build?: boolean; output?: boolean }, fw: { install: string | null; build: string | null; output: string | null }) {
  return {
    install: touched.install ? cur.install : fw.install ?? "",
    build: touched.build ? cur.build : fw.build ?? "",
    output: touched.output ? cur.output : fw.output ?? "",
  };
}

const FRAMEWORK_IDS = ["nextjs", "vite", "astro", "sveltekit", "remix", "react-router", "nuxt", "static", "worker", "node", "unknown"] as const;

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const b = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: b as Record<string, unknown> & { error?: string; code?: string } };
}

const alertCls = "mt-3 rounded-lg border border-fg/40 px-3 py-2 text-sm text-fg";

/** /new — New Project: import a Git repo (real GitHub reads), upload files, or create from a template. */
export function NewProject({ templates, initialMode }: { templates: TemplateOption[]; initialMode?: string | null }) {
  const { lang } = useLang();
  const th = lang === "th";
  // Mode lives in the URL (?mode=) so the GitHub OAuth round-trip lands back on the same tab.
  const [mode, setModeState] = useState<Mode>(isMode(initialMode ?? null) ? (initialMode as Mode) : "git");
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    const u = new URL(location.href);
    if (m === "git") u.searchParams.delete("mode"); else u.searchParams.set("mode", m);
    history.replaceState(history.state, "", `${u.pathname}${u.search}${u.hash}`);
  }, []);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{th ? "สร้างโปรเจกต์ใหม่" : "New Project"}</h1>
      <p className="mt-1 text-sm text-subtle">{th ? "นำเข้า repo ที่มีอยู่ อัปโหลดไฟล์ หรือเริ่มจากเทมเพลต แล้ว deploy ไปยัง Cloudflare ของคุณ" : "Import an existing repository, upload files, or start from a template, then deploy to your Cloudflare account."}</p>
      <div className="mt-6">
        <Segmented<Mode> legend={th ? "วิธีเริ่มต้น" : "How to start"} hideLegend value={mode} onChange={setMode}
          options={[{ value: "git", label: th ? "นำเข้า Git" : "Import Git" }, { value: "upload", label: th ? "อัปโหลดไฟล์" : "Upload files" }, { value: "template", label: th ? "เทมเพลต" : "Template" }]} />
      </div>
      {mode === "git" && <ImportGit th={th} />}
      {mode === "upload" && <UploadZipPanel onDone={(id) => { location.href = `/projects/${encodeURIComponent(id)}`; }} />}
      {mode === "template" && <FromTemplate th={th} templates={templates} />}
    </div>
  );
}

function ImportGit({ th }: { th: boolean }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [picked, setPicked] = useState<Repo | null>(null);

  const fetchList = useCallback(async (): Promise<ListState> => {
    try {
      const r = await getJson(`/api/github/repositories?q=${encodeURIComponent(query)}&page=${page}`);
      if (r.ok) return { kind: "ok", repos: (r.body.repos as Repo[]) ?? [], hasMore: Boolean(r.body.hasMore), page };
      if (r.body.code === "reauth" || r.body.code === "unauthorized" || r.body.code === "account_required") return { kind: "reauth", message: r.body.error ?? "" };
      if (r.status === 403) return { kind: "denied", message: r.body.error ?? "" };
      return { kind: "error", message: r.body.error ?? "Request failed" };
    } catch (e) { return { kind: "error", message: e instanceof Error ? e.message : String(e) }; }
  }, [query, page]);
  const load = useCallback(() => fetchList().then(setList), [fetchList]);

  useEffect(() => {
    let on = true;
    fetchList().then((x) => on && setList(x));
    return () => { on = false; };
  }, [fetchList]);


  if (picked) return <Configure th={th} repo={picked} onBack={() => setPicked(null)} />;
  return (
    <Card className="mt-6 p-5">
      <h2 className="text-base font-semibold text-fg">{th ? "นำเข้า Git Repository" : "Import Git Repository"}</h2>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q === query && page === 1) return; setList({ kind: "loading" }); setPage(1); setQuery(q); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label={th ? "ค้นหา repo" : "Search repositories"} value={q} onChange={(e) => setQ(e.target.value)} placeholder={th ? "ค้นหา..." : "Search..."} className="pl-9" maxLength={100} />
        </div>
        <button type="submit" className={buttonClasses("secondary", "md")}>{th ? "ค้นหา" : "Search"}</button>
      </form>
      <div className="mt-4" aria-live="polite">
        {list.kind === "loading" && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
        {list.kind === "reauth" && (
          <EmptyState title={th ? "เชื่อมต่อ GitHub" : "Connect GitHub"} description={list.message || (th ? "เชื่อมต่อหรือเชื่อมต่อใหม่เพื่อดูรายการ repo" : "Connect (or reconnect) GitHub to list your repositories.")}
            action={<ConnectLink className={buttonClasses("primary", "md")}><FolderGit2 className="h-4 w-4" aria-hidden />{th ? "เชื่อมต่อ GitHub" : "Connect GitHub"}</ConnectLink>} />
        )}
        {list.kind === "denied" && (
          <div role="alert" className={alertCls}>
            <p>{list.message}</p>
            <p className="mt-1 text-subtle">{th ? "สำหรับ repo ขององค์กร: ให้ผู้ดูแลอนุมัติ DevStack ใน GitHub → Settings → Applications แล้วลองใหม่" : "For organization repos, ask an org owner to approve DevStack in GitHub → Settings → Third-party access, then retry."}</p>
            <button type="button" onClick={() => { setList({ kind: "loading" }); void load(); }} className={`${buttonClasses("secondary", "sm")} mt-2`}><RefreshCw className="h-4 w-4" aria-hidden />{th ? "ลองใหม่" : "Retry"}</button>
          </div>
        )}
        {list.kind === "error" && (
          <div role="alert" className={alertCls}>
            <p>{list.message}</p>
            <button type="button" onClick={() => { setList({ kind: "loading" }); void load(); }} className={`${buttonClasses("secondary", "sm")} mt-2`}><RefreshCw className="h-4 w-4" aria-hidden />{th ? "ลองใหม่" : "Retry"}</button>
          </div>
        )}
        {list.kind === "ok" && list.repos.length === 0 && (
          <EmptyState title={query ? (th ? "ไม่พบ repo" : "No matching repositories") : (th ? "ยังไม่มี repo" : "No repositories")}
            description={th ? "ถ้า repo อยู่ในองค์กร ให้อนุมัติ DevStack สำหรับองค์กรนั้นบน GitHub" : "If the repo belongs to an organization, approve DevStack for that organization on GitHub."} />
        )}
        {list.kind === "ok" && list.repos.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {list.repos.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <FolderGit2 className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 truncate font-medium text-fg" title={r.fullName}>{r.fullName}</span>
                {r.private && <Badge variant="outline"><Lock className="mr-1 h-3 w-3" aria-hidden />{th ? "ส่วนตัว" : "Private"}</Badge>}
                <button type="button" onClick={() => setPicked(r)} className={`${buttonClasses("primary", "sm")} ml-auto`}>{th ? "นำเข้า" : "Import"}</button>
              </li>
            ))}
          </ul>
        )}
        {list.kind === "ok" && query && list.hasMore && (
          <p className="mt-3 text-xs text-subtle" role="status">{th ? "แสดงผลลัพธ์แรกเท่านั้น พิมพ์คำค้นให้ละเอียดขึ้น" : "Showing the first results. Refine your search to narrow it down."}</p>
        )}
        {list.kind === "ok" && !query && (page > 1 || list.hasMore) && (
          <div className="mt-3 flex justify-between">
            <button type="button" disabled={page <= 1} onClick={() => { setList({ kind: "loading" }); setPage((p) => p - 1); }} className={buttonClasses("ghost", "sm")}>{th ? "ก่อนหน้า" : "Previous"}</button>
            <button type="button" disabled={!list.hasMore} onClick={() => { setList({ kind: "loading" }); setPage((p) => p + 1); }} className={buttonClasses("ghost", "sm")}>{th ? "ถัดไป" : "Next"}</button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Configure({ th, repo, onBack }: { th: boolean; repo: Repo; onBack: () => void }) {
  const [info, setInfo] = useState<Inspect | null>(null);
  const [err, setErr] = useState("");
  const [branch, setBranch] = useState(repo.defaultBranch);
  const [root, setRoot] = useState("");
  const [name, setName] = useState(suggestName(repo.fullName.split("/")[1]));
  const [fw, setFw] = useState("unknown");
  const [install, setInstall] = useState("");
  const [build, setBuild] = useState("");
  const [output, setOutput] = useState("");
  const [node, setNode] = useState("22");
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(true);
  const touched = useRef<{ install?: boolean; build?: boolean; output?: boolean }>({});

  // Keep the form on screen while re-inspecting; only clear the error.
  const reset = () => { setErr(""); setInspecting(true); };
  const fetchInspect = useCallback(async (): Promise<{ info: Inspect } | { error: string }> => {
    const r = await getJson(`/api/github/inspect?repo=${encodeURIComponent(repo.fullName)}&ref=${encodeURIComponent(branch)}&root=${encodeURIComponent(root)}`).catch((e: unknown) => ({ ok: false, status: 0, body: { error: String(e) } as Record<string, unknown> & { error?: string } }));
    return r.ok ? { info: r.body as unknown as Inspect } : { error: r.body.error ?? "Inspect failed" };
  }, [repo.fullName, branch, root]);
  const apply = useCallback((x: { info: Inspect } | { error: string }) => {
    setInspecting(false);
    if ("error" in x) { setErr(x.error); return; }
    const i = x.info;
    const t = touched.current;
    setInfo(i); setFw(i.framework.id);
    setInstall((cur) => mergeDetected({ install: cur, build: "", output: "" }, t, i.framework).install);
    setBuild((cur) => mergeDetected({ install: "", build: cur, output: "" }, t, i.framework).build);
    setOutput((cur) => mergeDetected({ install: "", build: "", output: cur }, t, i.framework).output);
  }, []);
  const inspect = useCallback(() => fetchInspect().then(apply), [fetchInspect, apply]);

  useEffect(() => {
    let on = true;
    fetchInspect().then((x) => { if (on) apply(x); });
    return () => { on = false; };
  }, [fetchInspect, apply]);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await getJson("/api/projects/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: repo.fullName, branch, rootDirectory: root, name, build: { framework: fw, installCommand: install, buildCommand: build, outputDirectory: output || null, nodeVersion: node } }),
    }).catch((x: unknown) => ({ ok: false, status: 0, body: { error: String(x) } as Record<string, unknown> & { error?: string } }));
    setBusy(false);
    if (!r.ok) { setErr(r.body.error ?? "Import failed"); return; }
    location.href = `/projects/${encodeURIComponent((r.body.project as { id: string }).id)}`;
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-fg">{th ? "ตั้งค่าโปรเจกต์" : "Configure Project"}</h2>
        <span className="font-mono text-sm text-subtle">{repo.fullName}</span>
        {info && inspecting && <span role="status" className="inline-flex items-center gap-1.5 text-xs text-subtle"><Spinner size="sm" />{th ? "กำลังตรวจสอบ..." : "Inspecting..."}</span>}
        <button type="button" onClick={onBack} className={`${buttonClasses("ghost", "sm")} ml-auto`}>{th ? "เปลี่ยน repo" : "Change repo"}</button>
      </div>
      {!info && !err && <div className="mt-4 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
      {err && (
        <div role="alert" className={alertCls}>
          <p>{err}</p>
          <button type="button" onClick={() => { reset(); void inspect(); }} className={`${buttonClasses("secondary", "sm")} mt-2`}><RefreshCw className="h-4 w-4" aria-hidden />{th ? "ลองใหม่" : "Retry"}</button>
        </div>
      )}
      {info && (
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="np-name">{th ? "ชื่อโปรเจกต์" : "Project name"}</Label><Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={63} pattern={SLUG_PATTERN} title={th ? "ตัวพิมพ์เล็ก ตัวเลข และขีด (ไม่ขึ้นต้นหรือลงท้ายด้วยขีด)" : "Lowercase letters, digits and dashes (not at the start or end)"} className="font-mono" /></div>
          <div><Label htmlFor="np-branch"><GitBranch className="mr-1 inline h-3.5 w-3.5" aria-hidden />Branch</Label>
            <Select id="np-branch" value={branch} onChange={(e) => { reset(); setRoot(""); setBranch(e.target.value); }}>{(info.branches.length ? info.branches : [info.ref]).map((b) => <option key={b} value={b}>{b}</option>)}</Select></div>
          <div><Label htmlFor="np-root">{th ? "Root directory" : "Root directory"}</Label>
            <Select id="np-root" value={root} onChange={(e) => { reset(); setRoot(e.target.value); }}>{(info.roots.includes(root) ? info.roots : [root, ...info.roots]).map((x) => <option key={x || "."} value={x}>{x || "./"}</option>)}</Select></div>
          <div><Label htmlFor="np-fw">Framework {info.framework.id !== "unknown" && <Badge variant="success" className="ml-1">{th ? "ตรวจพบ" : "detected"}</Badge>}</Label>
            <Select id="np-fw" value={fw} onChange={(e) => setFw(e.target.value)}>{FRAMEWORK_IDS.map((f) => <option key={f} value={f}>{f === info.framework.id ? info.framework.label : f}</option>)}</Select></div>
          <div><Label htmlFor="np-node">Node.js</Label><Select id="np-node" value={node} onChange={(e) => setNode(e.target.value)}>{["20", "22", "24"].map((v) => <option key={v} value={v}>{v}</option>)}</Select></div>
          <div><Label htmlFor="np-install">Install command</Label><Input id="np-install" value={install} onChange={(e) => { touched.current.install = true; setInstall(e.target.value); }} className="font-mono" maxLength={200} /></div>
          <div><Label htmlFor="np-build">Build command</Label><Input id="np-build" value={build} onChange={(e) => { touched.current.build = true; setBuild(e.target.value); }} className="font-mono" maxLength={200} /></div>
          <div className="sm:col-span-2"><Label htmlFor="np-out">Output directory</Label><Input id="np-out" value={output} onChange={(e) => { touched.current.output = true; setOutput(e.target.value); }} className="font-mono" maxLength={200} /></div>
          {info.truncated && <p className="text-xs text-subtle sm:col-span-2">{th ? "repo ใหญ่มาก รายการโฟลเดอร์อาจไม่ครบ" : "Large repository: the folder list may be incomplete."}</p>}
          <div className="sm:col-span-2"><button type="submit" disabled={busy || inspecting || !name} className={buttonClasses("primary", "md")}>{busy ? (th ? "กำลังนำเข้า..." : "Importing...") : (th ? "นำเข้าโปรเจกต์" : "Import project")}</button></div>
        </form>
      )}
    </Card>
  );
}

function FromTemplate({ th, templates }: { th: boolean; templates: TemplateOption[] }) {
  const [id, setId] = useState(templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await getJson("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, private: priv, templateId: id }) })
      .catch((x: unknown) => ({ ok: false, status: 0, body: { error: String(x) } as Record<string, unknown> & { error?: string } }));
    setBusy(false);
    if (!r.ok) { setErr(r.body.error ?? "Failed"); return; }
    location.href = `/projects/${encodeURIComponent((r.body.project as { id: string }).id)}`;
  }
  return (
    <Card className="mt-6 p-5">
      <h2 className="text-base font-semibold text-fg">{th ? "เริ่มจากเทมเพลต" : "Start from a template"}</h2>
      <p className="mt-1 text-sm text-subtle">{th ? "สร้าง repo ใหม่ใน GitHub ของคุณจากเทมเพลต (ต้องเชื่อม GitHub)" : "Creates a new repository in your GitHub account from the template (GitHub connection required)."}</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="tp-id">{th ? "เทมเพลต" : "Template"}</Label>
          <Select id="tp-id" value={id} onChange={(e) => setId(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{th ? t.name.th : t.name.en} · {t.target}</option>)}</Select></div>
        <div><Label htmlFor="tp-name">{th ? "ชื่อ repo ใหม่" : "New repository name"}</Label><Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" placeholder="my-app" className="font-mono" /></div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="accent-current" />{th ? "ส่วนตัว" : "Private"}</label>
        <div className="sm:col-span-2"><button type="submit" disabled={busy || !name || !id} className={buttonClasses("primary", "md")}>{busy ? (th ? "กำลังสร้าง..." : "Creating...") : (th ? "สร้างโปรเจกต์" : "Create project")}</button></div>
      </form>
      {err && <p role="alert" className={alertCls}>{err}{/github/i.test(err) && <> · <ConnectLink className="underline underline-offset-4">{th ? "เชื่อมต่อ GitHub" : "Connect GitHub"}</ConnectLink></>}</p>}
    </Card>
  );
}
