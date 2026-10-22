"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, GitCommit, RotateCw } from "lucide-react";
import { buttonClasses, Card, EmptyState, Skeleton } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { LiveUrl, StatusPill } from "./deploy-status";

type Dep = { id: string; projectId: string; ref: string | null; commit: string | null; status: string; url: string | null; errorCode: string | null; errorLog: string | null; trigger: string; environment: string; createdAt: number; finishedAt: number | null; buildJobId: string | null };
type Job = { id: string; status: string; active: boolean; attempt: number; maxAttempts: number; cancelRequested: boolean; executor: string; startedAt: number | null; finishedAt: number | null };
type Ev = { seq: number; level: string; phase: string | null; message: string; created_at: number };
type Load = { kind: "loading" } | { kind: "error"; status: number; message: string } | { kind: "ok" };

const PHASES = ["queued", "claimed", "installing", "building", "uploading", "succeeded"] as const;
const POLL_MS = 2000;

/** /deployments/:id — status, phase timeline, live (polled, resumable) logs, Cancel and Redeploy. */
export function DeploymentDetail({ id }: { id: string }) {
  const { lang } = useLang();
  const th = lang === "th";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [dep, setDep] = useState<Dep | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [busy, setBusy] = useState<"" | "cancel" | "redeploy">("");
  const [actionErr, setActionErr] = useState("");
  const next = useRef(0);
  const logBox = useRef<HTMLPreElement>(null);

  const poll = useCallback(async (): Promise<boolean> => {
    const r = await fetch(`/api/deployments/${encodeURIComponent(id)}/logs?after=${next.current}`, { cache: "no-store" }).catch(() => null);
    if (!r) { setLoad({ kind: "error", status: 0, message: "Network error" }); return true; }
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setLoad({ kind: "error", status: r.status, message: b.error ?? "Request failed" }); return false; }
    setDep(b.deployment); setJob(b.job);
    if (b.events?.length) { setEvents((e) => [...e, ...b.events]); next.current = b.next; }
    setLoad({ kind: "ok" });
    return Boolean(b.job?.active) || b.deployment?.status === "queued" || b.deployment?.status === "uploading";
  }, [id]);

  useEffect(() => {
    let on = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => { const more = await poll(); if (on && more) t = setTimeout(tick, POLL_MS); };
    void tick();
    return () => { on = false; clearTimeout(t); };
  }, [poll]);

  useEffect(() => { logBox.current?.scrollTo({ top: logBox.current.scrollHeight }); }, [events.length]);

  async function cancel() {
    setBusy("cancel"); setActionErr("");
    const r = await fetch(`/api/deployments/${encodeURIComponent(id)}/cancel`, { method: "POST" }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy("");
    if (!r?.ok) { setActionErr(b?.error ?? "Cancel failed"); return; }
    await poll();
  }

  async function redeploy() {
    if (!dep) return;
    setBusy("redeploy"); setActionErr("");
    const body = dep.commit ? { ref: dep.commit } : {};
    const r = await fetch(`/api/projects/${encodeURIComponent(dep.projectId)}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy("");
    if (!r?.ok) { setActionErr(b?.error ?? "Redeploy failed"); return; }
    location.href = `/deployments/${encodeURIComponent(b.deployment.id)}`;
  }

  if (load.kind === "loading") return <div className="mx-auto w-full max-w-4xl space-y-3 px-4 py-8"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (load.kind === "error" && !dep) {
    const title = load.status === 401 ? (th ? "กรุณาเข้าสู่ระบบ" : "Sign in to view this deployment") : load.status === 404 ? (th ? "ไม่พบ deployment" : "Deployment not found") : (th ? "โหลดไม่สำเร็จ" : "Couldn't load the deployment");
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <EmptyState title={title} description={load.message}
          action={load.status === 401 ? <a href={`/login?next=/deployments/${encodeURIComponent(id)}`} className={buttonClasses("primary", "md")}>{th ? "เข้าสู่ระบบ" : "Sign in"}</a> : <button type="button" onClick={() => { setLoad({ kind: "loading" }); void poll(); }} className={buttonClasses("secondary", "md")}><RotateCw className="h-4 w-4" aria-hidden />{th ? "ลองใหม่" : "Retry"}</button>} />
      </div>
    );
  }
  if (!dep) return null;
  const jobState = job?.status ?? (dep.status === "live" ? "succeeded" : dep.status);
  const reached = new Set(events.map((e) => e.phase).filter(Boolean) as string[]);
  const active = Boolean(job?.active);
  const failedAt = ["failed", "canceled", "timed_out"].includes(jobState) ? jobState : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <a href={`/projects/${encodeURIComponent(dep.projectId)}`} className="inline-flex items-center gap-1 text-sm text-subtle hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />{th ? "กลับไปที่โปรเจกต์" : "Back to project"}</a>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{th ? "Deployment" : "Deployment"}</h1>
        <StatusPill status={dep.status} />
        {job && <span className="font-mono text-xs text-subtle">job: {job.status}{job.cancelRequested && job.active ? " · cancel requested" : ""}</span>}
        <div className="ml-auto flex gap-2">
          {active && <button type="button" disabled={busy !== "" || job?.cancelRequested} onClick={() => void cancel()} className={buttonClasses("secondary", "sm")}><Ban className="h-4 w-4" aria-hidden />{busy === "cancel" ? "…" : th ? "ยกเลิก" : "Cancel"}</button>}
          {!active && <button type="button" disabled={busy !== ""} onClick={() => void redeploy()} className={buttonClasses("primary", "sm")}><RotateCw className="h-4 w-4" aria-hidden />{busy === "redeploy" ? "…" : dep.commit ? (th ? "Deploy commit นี้อีกครั้ง" : "Redeploy this commit") : (th ? "Deploy อีกครั้ง" : "Redeploy")}</button>}
        </div>
      </div>
      {actionErr && <p role="alert" className="mt-3 rounded-lg border border-fg/40 px-3 py-2 text-sm text-fg">{actionErr}</p>}

      <Card className="mt-5 grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div><div className="text-subtle">Ref</div><div className="font-mono text-fg">{dep.ref ?? "—"}</div></div>
        <div><div className="text-subtle">Commit</div><div className="flex items-center gap-1 font-mono text-fg"><GitCommit className="h-4 w-4 text-subtle" aria-hidden />{dep.commit ? dep.commit.slice(0, 7) : "—"}</div></div>
        <div><div className="text-subtle">{th ? "สภาพแวดล้อม" : "Environment"}</div><div className="text-fg">{dep.environment} · {dep.trigger}</div></div>
        <div><div className="text-subtle">{th ? "เวลา" : "Started / finished"}</div><div className="font-mono text-xs text-fg">{new Date(dep.createdAt).toLocaleString()}{dep.finishedAt ? ` → ${Math.max(0, Math.round((dep.finishedAt - dep.createdAt) / 1000))}s` : ""}</div></div>
        {dep.url && dep.status === "live" && <div className="sm:col-span-2"><LiveUrl url={dep.url} /></div>}
        {dep.status === "failed" && dep.errorCode && <div className="sm:col-span-2"><div className="text-subtle">{th ? "ข้อผิดพลาด" : "Error"}</div><div className="font-mono text-fg">{dep.errorCode}</div></div>}
      </Card>

      <h2 className="mt-6 text-base font-semibold text-fg">{th ? "ลำดับขั้น" : "Timeline"}</h2>
      <ol className="mt-3 flex flex-wrap gap-2" aria-label="Build phases">
        {PHASES.map((p) => {
          const done = reached.has(p) || (p === "succeeded" && jobState === "succeeded");
          const current = jobState === p && active;
          return <li key={p} className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${done ? "border-fg text-fg" : "border-border text-subtle"} ${current ? "bg-surface-2" : ""}`}>{p}</li>;
        })}
        {failedAt && <li className="rounded-full border border-fg bg-fg px-2.5 py-0.5 font-mono text-[11px] text-bg">{failedAt}</li>}
      </ol>

      <div className="mt-6 flex items-center gap-2"><h2 className="text-base font-semibold text-fg">{th ? "Build logs" : "Build logs"}</h2>{active && <span className="font-mono text-[11px] text-subtle">{th ? "กำลังอัปเดต…" : "live…"}</span>}</div>
      {!dep.buildJobId ? (
        <p className="mt-2 text-sm text-subtle">{th ? "deployment นี้สร้างก่อนมีระบบ build job จึงไม่มี log ทีละบรรทัด" : "This deployment predates build jobs, so there are no line-by-line logs."}</p>
      ) : (
        <pre ref={logBox} aria-live="polite" className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 font-mono text-[12px] leading-5 text-fg">
          {events.length === 0 ? <span className="text-subtle">{th ? "ยังไม่มี log" : "No log lines yet."}</span> : events.map((e) => (
            <div key={e.seq} className={e.level === "error" ? "text-fg" : e.level === "warn" ? "text-fg" : "text-subtle"}>
              <span className="select-none text-subtle">{String(e.seq).padStart(3, " ")} {new Date(e.created_at).toLocaleTimeString()} {e.phase ? `[${e.phase}]` : ""} </span>{e.level === "error" ? "ERROR " : e.level === "warn" ? "WARN " : ""}{e.message}
            </div>
          ))}
        </pre>
      )}
      {!dep.buildJobId && dep.errorLog && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border p-2 font-mono text-[11px] text-subtle">{dep.errorLog}</pre>}
    </div>
  );
}
