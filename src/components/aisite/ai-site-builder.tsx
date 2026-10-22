"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, buttonClasses, Card, Input, Spinner, Textarea } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { AISITE_TEXT, type AiSiteKey } from "./i18n";

type Version = { version: number; kind: string; summary: string | null; file_count: number; bytes: number; created_at: number; deploy_status: string | null; url: string | null; alias_url: string | null; build_job_id: string | null; error_log: string | null };
type Msg = { id: number; role: "user" | "assistant" | "error"; content: string; version: number | null };
type Ev = { seq: number; level: string; phase: string | null; message: string };
type State = { project: { id: string; name: string; slug: string }; versions: Version[]; messages: Msg[]; files: { path: string; bytes: number }[]; latest: number; events: Ev[]; infra: { ai: boolean; via: string; sites: boolean; dnsReady: boolean } };
type Publish = { status: string; url?: string; reason?: string; jobId?: string };

/** Only user-site origins may be framed: https://<label>.devstack.bid, never the apex. */
export function safePreviewUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.devstack\.bid$/.test(url.hostname) || url.hostname === "www.devstack.bid") return null;
    return url.origin + "/";
  } catch { return null; }
}

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const b = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string };
  return { ok: r.ok, status: r.status, body: b };
}

export function AiSiteBuilder() {
  const { lang } = useLang();
  const L = (k: AiSiteKey) => AISITE_TEXT[lang === "th" ? "th" : "en"][k];
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[] | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<Publish | null>(null);
  const [tab, setTab] = useState<"chat" | "preview">("chat");
  const [side, setSide] = useState<"history" | "files" | "logs">("history");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadProjects = useCallback(async () => {
    const r = await call("/api/ai-sites");
    if (r.status === 401) { setAuthErr(r.body.error ?? L("signIn")); return; }
    setProjects((r.body.projects as typeof projects) ?? []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (id: string, job?: string | null) => {
    const r = await call(`/api/ai-sites/${id}${job ? `?job=${encodeURIComponent(job)}` : ""}`);
    if (r.ok) setSt(r.body as unknown as State);
    else setErr(r.body.error ?? "Error");
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the response
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the response
  useEffect(() => { if (pid) void load(pid, null); }, [pid, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [st?.messages.length, busy]);

  const current = st?.versions[0] ?? null;
  const job = current?.build_job_id ?? null;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the response
  useEffect(() => { if (pid && job) void load(pid, job); }, [pid, job, load]);

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true); setErr(null); setNote(null);
    const r = await call(`/api/ai-sites/${pid ?? "new"}/turn`, { method: "POST", body: JSON.stringify({ prompt: text, lang }) });
    setBusy(false);
    if (!r.ok) { setErr(r.body.error ?? `HTTP ${r.status}`); if (pid) void load(pid); return; }
    setPrompt("");
    setLast(r.body.publish as Publish);
    const id = String(r.body.projectId);
    if (id !== pid) { setPid(id); void loadProjects(); } else void load(id);
  }

  async function action(path: string, payload: unknown, done: (b: Record<string, unknown>) => string) {
    if (!pid) return;
    setBusy(true); setErr(null); setNote(null);
    const r = await call(`/api/ai-sites/${pid}/${path}`, { method: "POST", body: JSON.stringify(payload) });
    setBusy(false);
    if (!r.ok) { setErr(r.body.error ?? `HTTP ${r.status}`); return; }
    if (r.body.publish) setLast(r.body.publish as Publish);
    setNote(done(r.body));
    void load(pid);
  }

  if (authErr) return <main className="mx-auto max-w-xl p-6"><Card className="p-6"><p className="text-sm">{authErr}</p><a className={buttonClasses("primary", "md", "mt-4")} href="/login?next=/chat/build">Sign in</a></Card></main>;

  const preview = safePreviewUrl(current?.url);
  const status = (v: Version | null) => {
    if (!v?.deploy_status) return <Badge variant="warning">{L("blocked")}</Badge>;
    if (v.deploy_status === "live") return st?.infra.dnsReady ? <Badge variant="success">{L("live")}</Badge> : <Badge variant="warning">{L("dnsBlocked")}</Badge>;
    if (v.deploy_status === "failed") return <Badge variant="danger">{L("failed")}</Badge>;
    return <Badge variant="info">{v.deploy_status}</Badge>;
  };

  const chatPane = (
    <section className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`} aria-label={L("chat")}>
      <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {!st?.messages.length && <p className="text-sm text-muted">{L("intro")}</p>}
        {st?.messages.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-primary-soft" : m.role === "error" ? "mr-8 border-l-4 border-danger bg-surface-2" : "mr-8 bg-surface-2"}`}>
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.version ? <p className="mt-1 text-xs text-muted">{L("version")} {m.version}</p> : null}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> {L("sending")}</p>}
        {last && last.status !== "live" && <p className="rounded-lg border border-warning px-3 py-2 text-xs" role="status">{last.status === "failed" ? L("failed") : L("blocked")}: {last.reason}</p>}
        <div ref={endRef} />
      </div>
      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Textarea aria-label={L("placeholder")} placeholder={L("placeholder")} value={prompt} maxLength={4000} rows={3} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{st ? `${L("via")}: ${st.infra.via === "cf-ai-gateway" ? L("gw") : L("direct")}` : L("untrusted")}</span>
          <button type="submit" className={buttonClasses("primary", "md")} disabled={busy || !prompt.trim()}>{busy ? L("sending") : L("send")}</button>
        </div>
        {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
        {note && <p className="mt-2 text-sm" role="status">{note}</p>}
      </form>
    </section>
  );

  const previewPane = (
    <section className={`${tab === "preview" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`} aria-label={L("preview")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-xs">
        {current ? <>{L("version")} {current.version} {status(current)}</> : null}
        {preview && <a className="truncate text-link underline" href={preview} target="_blank" rel="noopener noreferrer">{new URL(preview).host} ({L("openNew")})</a>}
        {current?.alias_url && <span>{L("production")}: <a className="text-link underline" href={current.alias_url} target="_blank" rel="noopener noreferrer">{new URL(current.alias_url).host}</a></span>}
      </div>
      <div className="min-h-[50vh] flex-1 bg-white">
        {preview ? (
          // Untrusted generated code: cross-origin (*.devstack.bid) and sandboxed without allow-same-origin.
          <iframe key={preview} title={L("preview")} src={preview} className="h-full min-h-[50vh] w-full" sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" />
        ) : (
          <p className="p-6 text-sm text-muted">{st && !st.infra.sites ? L("sitesOff") : current?.error_log ?? L("noPreview")}</p>
        )}
      </div>
      <div className="border-t border-border p-2">
        <div className="mb-2 flex gap-1" role="tablist">
          {(["history", "files", "logs"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={side === k} className={buttonClasses(side === k ? "secondary" : "ghost", "sm")} onClick={() => setSide(k)}>{L(k)}</button>
          ))}
        </div>
        <div className="max-h-56 overflow-y-auto text-xs">
          {side === "history" && st?.versions.map((v) => (
            <div key={v.version} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5">
              <span className="font-medium">v{v.version}</span>{status(v)}
              <span className="min-w-0 flex-1 truncate text-muted" title={v.summary ?? ""}>{v.summary}</span>
              {v.version !== st.latest && <button className={buttonClasses("ghost", "sm")} disabled={busy} onClick={() => void action("revert", { version: v.version }, (b) => `${L("version")} ${b.version}`)}>{L("revert")}</button>}
              {v.deploy_status === "live" && <button className={buttonClasses("ghost", "sm")} disabled={busy} onClick={() => void action("promote", { version: v.version }, (b) => `${L("production")}: ${b.url}${b.dnsReady ? "" : ` (${L("dnsBlocked")})`}`)}>{L("promote")}</button>}
            </div>
          ))}
          {side === "files" && st?.files.map((f) => <div key={f.path} className="flex justify-between py-0.5 font-mono"><span>{f.path}</span><span className="text-muted">{f.bytes} B</span></div>)}
          {side === "logs" && (
            <pre className="whitespace-pre-wrap font-mono">{st?.events.map((e) => <div key={e.seq} className={e.level === "error" ? "text-danger" : e.level === "warn" ? "text-warning" : ""}>[{e.phase}] {e.message}</div>)}</pre>
          )}
        </div>
        {st?.latest ? (
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void action("export", { repo, branch }, (b) => `${L("export")}: ${b.repo}@${b.branch} (${b.files})`); }}>
            <Input aria-label={L("exportRepo")} placeholder={L("exportRepo")} value={repo} onChange={(e) => setRepo(e.target.value)} className="min-w-0 flex-1" />
            <Input aria-label={L("branch")} value={branch} onChange={(e) => setBranch(e.target.value)} className="w-24" />
            <button className={buttonClasses("secondary", "sm")} disabled={busy || !repo}>{L("export")}</button>
          </form>
        ) : null}
      </div>
    </section>
  );

  return (
    <main className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col px-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <h1 className="text-lg font-semibold">{L("title")}</h1>
        <select aria-label={L("projects")} className="rounded-md border border-border bg-surface px-2 py-1 text-sm" value={pid ?? ""} onChange={(e) => { setPid(e.target.value || null); setSt(null); setLast(null); }}>
          <option value="">{L("newProject")}</option>
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>)}
        </select>
        {st && !st.infra.ai && <Badge variant="warning">{L("aiOff")}</Badge>}
        <div className="ml-auto flex gap-1 lg:hidden" role="tablist">
          {(["chat", "preview"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={buttonClasses(tab === k ? "secondary" : "ghost", "sm")} onClick={() => setTab(k)}>{L(k)}</button>)}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-[minmax(320px,2fr)_3fr] lg:divide-x lg:divide-border">
        {chatPane}
        {previewPane}
      </div>
    </main>
  );
}
