"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, RotateCw, X } from "lucide-react";
import { buttonClasses, copyText, Spinner } from "@/components/ui";

export type DeploymentView = {
  id: string;
  projectId: string;
  ref: string | null;
  status: string;
  url: string | null;
  errorCode: string | null;
  errorLog: string | null;
  fixAttempts: number;
  maxFixAttempts: number;
  createdAt: number;
};

const DONE = new Set(["live", "failed"]);

/** Poll one deployment until it is live or failed. */
export function useDeployment(id: string | null) {
  const [d, setD] = useState<DeploymentView | null>(null);
  useEffect(() => {
    if (!id) return;
    let on = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await fetch(`/api/deployments/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
      const b = r?.ok ? await r.json().catch(() => null) : null;
      if (!on) return;
      if (b?.deployment) setD(b.deployment);
      if (!b?.deployment || !DONE.has(b.deployment.status)) timer = setTimeout(tick, 3000);
    };
    void tick();
    return () => { on = false; clearTimeout(timer); };
  }, [id]);
  return d;
}

export function StatusPill({ status }: { status: string }) {
  const icon = status === "live" ? <Check className="h-3 w-3" aria-hidden /> : status === "failed" ? <X className="h-3 w-3" aria-hidden /> : <Spinner size="sm" />;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] ${status === "live" ? "border-fg text-fg" : status === "failed" ? "border-fg bg-fg text-bg" : "border-border text-subtle"}`}>
      {icon}
      {status}
    </span>
  );
}

export function LiveUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-fg underline underline-offset-4">{url.replace(/^https:\/\//, "")}<ExternalLink className="h-3 w-3" aria-hidden /></a>
      <button type="button" aria-label="Copy URL" onClick={() => { void copyText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="rounded p-1 text-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg">
        {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      </button>
    </span>
  );
}

/** Start a deploy (always an explicit user click). Returns the new deployment id. */
export async function requestDeploy(projectId: string, ref: string | null): Promise<string> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ref ? { ref } : {}) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Deploy failed to start");
  return b.deployment.id as string;
}

export function RetryButton({ projectId, refName, onStarted, label = "Retry deploy" }: { projectId: string; refName: string | null; onStarted: (id: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try { onStarted(await requestDeploy(projectId, refName)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={go} className={buttonClasses("primary", "sm")}><RotateCw className="h-3.5 w-3.5" aria-hidden />{label}</button>
      {err && <span role="alert" className="text-xs text-fg">{err}</span>}
    </span>
  );
}
