"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge, buttonClasses, Card, Input, Spinner, Textarea, type BadgeVariant } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { AISITE_TEXT, codeText, fmt, versionStatus, type AiSiteKey } from "./i18n";

type Version = { version: number; kind: string; summary: string | null; file_count: number; bytes: number; created_at: number; deploy_status: string | null; url: string | null; alias_url: string | null; build_job_id: string | null; error_log: string | null };
type Msg = { id: number; role: "user" | "assistant" | "error"; content: string; version: number | null };
type Ev = { seq: number; level: string; phase: string | null; message: string };
type Infra = { ai?: boolean; aiBlocked: string | null; via?: string | null; sites: boolean; dnsReady: boolean };
type State = { project: { id: string; name: string; slug: string }; versions: Version[]; messages: Msg[]; files: { path: string; bytes: number }[]; latest: number; events: Ev[]; infra: Infra };
type Banner = { kind: "error" | "ok"; text: string } | null;
type Tab = "chat" | "preview" | "history";

/** Only user-site origins may be framed: https://<label>.devstack.bid, never the apex. */
export function safePreviewUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.devstack\.bid$/.test(url.hostname) || url.hostname === "www.devstack.bid") return null;
    return url.origin + "/";
  } catch { return null; }
}

/** Sandbox for untrusted generated code: scripts and forms only (no popups, no same-origin, no top navigation). */
export const PREVIEW_SANDBOX = "allow-scripts allow-forms";

/** The version currently served on <slug>.devstack.bid (the deployment holding the production alias). */
export const productionVersion = (vs: Pick<Version, "version" | "alias_url">[]) => vs.find((v) => !!v.alias_url)?.version ?? null;

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const b = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; code?: string };
  return { ok: r.ok, status: r.status, body: b };
}

const VARIANT: Record<string, BadgeVariant> = { "st.live": "success", "st.failed": "danger", "st.blocked": "warning", "st.dnsBlocked": "warning", "st.pending": "neutral", "st.queued": "info", "st.building": "info", "st.uploading": "info" };

export function AiSiteBuilder() {
  const { lang: rawLang } = useLang();
  const lang = rawLang === "th" ? "th" : "en";
  const L = (k: AiSiteKey) => AISITE_TEXT[lang][k];
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[] | null>(null);
  const [baseInfra, setBaseInfra] = useState<Infra | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [pid, setPid] = useState<string | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [fresh, setFresh] = useState(false);
  const [side, setSide] = useState<"history" | "files" | "logs">("history");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const seenLive = useRef<number>(0);

  const fail = useCallback((b: { error?: string; code?: string }, status: number) => setBanner({ kind: "error", text: codeText(lang, b.code, b.error ?? `HTTP ${status}`) }), [lang]);

  const loadProjects = useCallback(async () => {
    const r = await call("/api/ai-sites");
    if (r.status === 401) { setSignedOut(true); return; }
    setProjects((r.body.projects as typeof projects) ?? []);
    setBaseInfra((r.body.infra as Infra) ?? null);
  }, []);  

  const load = useCallback(async (id: string, job?: string | null) => {
    const r = await call(`/api/ai-sites/${id}${job ? `?job=${encodeURIComponent(job)}` : ""}`);
    if (r.ok) setSt(r.body as unknown as State);
    else fail(r.body, r.status);
  }, [fail]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the response
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the response
  useEffect(() => { if (pid) void load(pid, null); }, [pid, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [st?.messages.length, busy]);

  const current = st?.versions[0] ?? null;
  const job = current?.build_job_id ?? null;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the response
  useEffect(() => { if (pid && job) void load(pid, job); }, [pid, job, load]);
  // A new version went live: badge the Preview tab (mobile) instead of yanking the user away from the chat.
  useEffect(() => {
    if (current?.deploy_status === "live" && current.version > seenLive.current) {
      const first = seenLive.current === 0;
      seenLive.current = current.version;
       
      if (!first && tab !== "preview") setFresh(true);
    }
  }, [current?.deploy_status, current?.version, tab]);

  function switchTab(t: Tab) { setTab(t); if (t === "preview") setFresh(false); }

  function switchProject(id: string | null) {
    setPid(id); setSt(null); setBanner(null); setFresh(false); setBranch(null); seenLive.current = 0;
  }

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true); setBanner(null);
    const r = await call(`/api/ai-sites/${pid ?? "new"}/turn`, { method: "POST", body: JSON.stringify({ prompt: text, lang }) });
    setBusy(false);
    if (!r.ok) { fail(r.body, r.status); if (pid) void load(pid); return; }
    setPrompt("");
    const pub = r.body.publish as { status: string } | undefined;
    if (pub?.status === "live") setFresh(tab !== "preview");
    const id = String(r.body.projectId);
    if (id !== pid) { switchProject(id); void loadProjects(); } else void load(id);
  }

  async function action(path: string, payload: unknown, confirmText: string, done: (b: Record<string, unknown>) => string) {
    if (!pid || !window.confirm(confirmText)) return;
    setBusy(true); setBanner(null);
    const r = await call(`/api/ai-sites/${pid}/${path}`, { method: "POST", body: JSON.stringify(payload) });
    setBusy(false);
    if (!r.ok) { fail(r.body, r.status); return; }
    setBanner({ kind: "ok", text: done(r.body) });
    void load(pid);
  }

  if (signedOut) {
    return <main className="mx-auto max-w-xl p-6"><Card className="p-6"><p className="text-sm">{L("signInBody")}</p><a className={buttonClasses("primary", "md", "mt-4")} href="/login?next=/chat/build">{L("signIn")}</a></Card></main>;
  }

  const infra: Infra | null = st?.infra ?? baseInfra;
  const prodV = st ? productionVersion(st.versions) : null;
  const preview = safePreviewUrl(current?.url);
  const exportBranch = branch ?? `devstack/v${st?.latest ?? 1}`;
  const lastAnnounce = [...(st?.messages ?? [])].reverse().find((m) => m.role !== "user");

  const statusBadge = (v: Version) => {
    const s = versionStatus(v, { sites: !!infra?.sites, dnsReady: !!infra?.dnsReady });
    const reason = s.why ? L(s.why) : s.detail ?? "";
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge variant={VARIANT[s.key]}>{L(s.key)}</Badge>
        {reason && s.key !== "st.live" ? <span className="text-muted">{reason.slice(0, 140)}</span> : null}
      </span>
    );
  };

  const bannerEl = banner && (
    <div role={banner.kind === "error" ? "alert" : "status"} className={`m-2 rounded-lg border px-3 py-2 text-sm ${banner.kind === "error" ? "border-danger" : "border-success"}`}>
      <div className="flex items-start justify-between gap-2"><span>{banner.text}</span><button className={buttonClasses("ghost", "sm")} onClick={() => setBanner(null)} aria-label={L("dismiss")} title={L("dismiss")}><X aria-hidden="true" className="size-4" /></button></div>
    </div>
  );
  const aiBlockedEl = infra?.aiBlocked && (
    <div role="status" className="m-2 rounded-lg border border-warning px-3 py-2 text-sm">
      <Badge variant="warning">{L("st.blocked")}</Badge> {infra.aiBlocked === "ai_gateway_required" ? L("why.gateway") : L("why.ai")}
    </div>
  );

  const historyList = (
    <div className="min-h-0 overflow-y-auto text-xs">
      <div className="mb-2 flex gap-1" role="tablist">
        {(["history", "files", "logs"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={side === k} className={buttonClasses(side === k ? "secondary" : "ghost", "sm")} onClick={() => setSide(k)}>{L(k)}</button>
        ))}
      </div>
      {side === "history" && st?.versions.map((v) => (
        <div key={v.version} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5">
          <span className="font-medium">v{v.version}</span>
          {v.version === prodV && <Badge variant="primary">{L("production")}</Badge>}
          {statusBadge(v)}
          <span className="min-w-0 basis-full truncate text-muted sm:basis-auto sm:flex-1" title={v.summary ?? ""}>{v.summary}</span>
          {v.version !== st.latest && (
            <button className={buttonClasses("ghost", "sm")} disabled={busy}
              onClick={() => void action("revert", { version: v.version }, fmt(L("confirmRestore"), { v: v.version }), (b) => fmt(L("restored"), { from: Number(b.from), to: Number(b.version) }))}>{L("revert")}</button>
          )}
          {v.deploy_status === "live" && v.version !== prodV && (
            <button className={buttonClasses("ghost", "sm")} disabled={busy}
              onClick={() => void action("promote", { version: v.version }, prodV ? fmt(L("confirmPromote"), { from: prodV, to: v.version }) : fmt(L("confirmPromoteFirst"), { to: v.version }),
                (b) => fmt(L("promoted"), { v: v.version, url: String(b.url) }) + (b.dnsReady ? "" : ` (${L("st.dnsBlocked")})`))}>{L("promote")}</button>
          )}
        </div>
      ))}
      {side === "files" && st?.files.map((f) => <div key={f.path} className="flex justify-between py-0.5 font-mono"><span className="truncate">{f.path}</span><span className="text-muted">{f.bytes} B</span></div>)}
      {side === "logs" && (
        <div className="whitespace-pre-wrap font-mono">{st?.events.map((e) => <div key={e.seq} className={e.level === "error" ? "border-l-2 border-danger pl-1 text-danger" : e.level === "warn" ? "border-l-2 border-warning pl-1" : ""}>[{e.phase}] {e.message}</div>)}</div>
      )}
      {st?.latest ? (
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          const n = st.files.length;
          void action("export", { repo, branch: exportBranch }, fmt(L("confirmExport"), { n, repo, branch: exportBranch }), (b) => fmt(L("exported"), { repo: String(b.repo), branch: String(b.branch), n: Number(b.files) }));
        }}>
          <label className="min-w-0 flex-1 text-xs">{L("exportRepo")}<Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" /></label>
          <label className="w-40 text-xs">{L("branch")}<Input value={exportBranch} onChange={(e) => setBranch(e.target.value)} /></label>
          <button className={buttonClasses("secondary", "sm")} disabled={busy || !repo}>{L("export")}</button>
        </form>
      ) : null}
    </div>
  );

  const chatPane = (
    <section className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`} aria-label={L("chat")}>
      {bannerEl}{aiBlockedEl}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!st?.messages.length && <p className="text-sm text-muted">{L("intro")}</p>}
        {st?.messages.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-primary-soft" : m.role === "error" ? "mr-8 border-l-4 border-danger bg-surface-2" : "mr-8 bg-surface-2"}`}>
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.version ? <p className="mt-1 text-xs text-muted">{L("version")} {m.version}</p> : null}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> {L("sending")}</p>}
        <div ref={endRef} />
      </div>
      {/* Screen readers hear only the newest reply, not the whole transcript. */}
      <p className="sr-only" aria-live="polite">{lastAnnounce?.content ?? ""}</p>
      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Textarea aria-label={L("placeholder")} placeholder={L("placeholder")} value={prompt} maxLength={4000} rows={3} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{infra?.via ? `${L("via")}: ${infra.via === "cf-ai-gateway" ? L("gw") : L("direct")}` : L("untrusted")}</span>
          <button type="submit" className={buttonClasses("primary", "md")} disabled={busy || !prompt.trim() || !!infra?.aiBlocked}>{busy ? L("sending") : L("send")}</button>
        </div>
      </form>
    </section>
  );

  const previewPane = (
    <section className={`${tab === "preview" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`} aria-label={L("preview")}>
      {tab === "preview" && <div className="lg:hidden">{bannerEl}</div>}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-xs">
        {current ? <><span>{L("version")} {current.version}</span>{statusBadge(current)}</> : null}
        {preview && <a className="truncate text-link underline" href={preview} target="_blank" rel="noopener noreferrer">{new URL(preview).host} ({L("openNew")})</a>}
        {prodV && st && <span>{L("production")}: v{prodV}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        {preview ? (
          // Untrusted generated code: cross-origin (*.devstack.bid), sandboxed without allow-same-origin or allow-popups.
          <iframe key={preview} title={L("preview")} src={preview} className="min-h-0 w-full flex-1" sandbox={PREVIEW_SANDBOX} referrerPolicy="no-referrer" />
        ) : (
          <p className="p-6 text-sm text-muted">{infra && !infra.sites ? `${L("st.blocked")}: ${L("why.sites")}` : current?.error_log ?? L("noPreview")}</p>
        )}
      </div>
      <details className="hidden max-h-[40%] min-h-0 border-t border-border p-2 lg:block">
        <summary className="cursor-pointer text-xs font-medium">{L("details")}</summary>
        {/* <details> ignores display:flex on its children in some engines; the wrapper owns the scroll layout. */}
        <div className="flex max-h-[30vh] min-h-0 flex-col overflow-y-auto pt-2">{historyList}</div>
      </details>
    </section>
  );

  const historyPane = (
    <section className={`${tab === "history" ? "flex" : "hidden"} min-h-0 flex-col p-2 lg:hidden`} aria-label={L("history")}>
      {tab === "history" && bannerEl}
      {historyList}
    </section>
  );

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-7xl flex-col px-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <h1 className="text-lg font-semibold">{L("title")}</h1>
        <select aria-label={L("projects")} className="min-w-0 max-w-[50vw] rounded-md border border-border bg-surface px-2 py-1 text-sm" value={pid ?? ""} onChange={(e) => switchProject(e.target.value || null)}>
          <option value="">{L("newProject")}</option>
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>)}
        </select>
        <div className="ml-auto flex gap-1 lg:hidden" role="tablist">
          {(["chat", "preview", "history"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={buttonClasses(tab === k ? "secondary" : "ghost", "sm")} onClick={() => switchTab(k)}>
              {L(k)}{k === "preview" && fresh ? <Badge variant="primary" className="ml-1">{L("newVersion")}</Badge> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-[minmax(320px,2fr)_3fr] lg:divide-x lg:divide-border">
        {chatPane}
        {previewPane}
        {historyPane}
      </div>
    </main>
  );
}
