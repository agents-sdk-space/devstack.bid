"use client";

import { useCallback, useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { Card, copyText } from "@/components/ui";
import { useLang } from "@/components/prefs";
import type { DeployProfile } from "@/lib/deploy/templates";
import { LiveUrl, RetryButton, StatusPill, type DeploymentView } from "../deploy/deploy-status";

/** Option A: direct deploy into the customer's Cloudflare account + deployments timeline. */
export function DirectDeployPanel({ projectId, profile }: { projectId: string; profile: DeployProfile }) {
  const { lang } = useLang();
  const th = lang === "th";
  const [items, setItems] = useState<DeploymentView[]>([]);
  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/deploy`, { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return (b.deployments ?? []) as DeploymentView[];
  }, [projectId]);

  useEffect(() => {
    let on = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const list = await load().catch(() => []);
      if (!on) return;
      setItems(list);
      if (list.some((d) => d.status === "queued" || d.status === "uploading")) timer = setTimeout(tick, 3000);
    };
    void tick();
    return () => { on = false; clearTimeout(timer); };
  }, [load]);

  const refresh = () => { void load().then(setItems); setTimeout(() => void load().then(setItems), 3000); };
  const direct = profile.path === "direct";

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5" aria-hidden />
        <h2 className="text-base font-semibold text-fg">{th ? "Deploy ตรงเข้าบัญชี Cloudflare ของคุณ" : "Direct deploy to your Cloudflare account"}</h2>
      </div>
      {direct ? (
        <div className="mt-3"><RetryButton projectId={projectId} refName={null} onStarted={refresh} label={th ? "Deploy" : "Deploy"} /></div>
      ) : (
        <p className="mt-3 text-sm text-subtle">{th ? "โปรเจกต์นี้ต้อง build ก่อน จึงใช้ปุ่ม Deploy to Cloudflare / Workers Builds ด้านบน" : "This project needs a build step — use Deploy to Cloudflare / Workers Builds above."}</p>
      )}
      <ol className="mt-4 space-y-3 border-l border-border pl-4">
        {items.map((d) => (
          <li key={d.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-fg bg-bg" aria-hidden />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill status={d.status} />
              <span className="font-mono text-xs text-subtle">{d.ref} · {new Date(d.createdAt).toLocaleString()}</span>
              {d.fixAttempts > 0 && <span className="font-mono text-[11px] text-subtle">fix {d.fixAttempts}/{d.maxFixAttempts}</span>}
            </div>
            {d.url && d.status === "live" && <div className="mt-1"><LiveUrl url={d.url} /></div>}
            {d.status === "failed" && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-fg">{d.errorCode}</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border p-2 font-mono text-[11px] text-subtle">{d.errorLog}</pre>
                <button type="button" onClick={() => void copyText(`Deploy ${d.id} failed. Read the deploy logs and fix it.`)} className="mt-1 text-subtle underline underline-offset-4 hover:text-fg">
                  {th ? "คัดลอกข้อความให้แชตช่วยแก้ (Dev Chat)" : "Copy a prompt for Dev Chat to fix it"}
                </button>
              </details>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-subtle">{th ? "ยังไม่มีการ deploy" : "No deployments yet."}</li>}
      </ol>
    </Card>
  );
}
