"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";

type Live = {
  now: number; active: number; totals: { events: number; visitors: number };
  pages: { path: string; views: number; visitors: number }[];
  recent: { ts: number; vid: string; type: string; path: string | null; target: string | null; topic: string | null; country: string | null }[];
  topics: { topic: string; n: number }[]; series: { m: number; n: number }[];
};
const ago = (ts: number) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };

/** Admin-only live dashboard: polls /api/activity/live every 3 s (paused while the tab is hidden). */
export function LiveActivity() {
  const [d, setD] = useState<Live | null>(null);
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (!document.hidden) {
        const r = await fetch("/api/activity/live", { credentials: "same-origin" }).catch(() => null);
        const j = await r?.json().catch(() => null);
        if (r?.ok && j?.ok) { setD(j); setErr(null); }
        else { setErr({ code: j?.code ?? "network", msg: j?.error ?? "Could not reach the server." }); if (r && (r.status === 401 || r.status === 403)) stop = true; }
      }
      if (!stop) timer.current = setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer.current); };
  }, []);
  if (err && !d) return (
    <div className="mx-auto max-w-content px-4 py-16">
      <h1 className="text-2xl font-semibold text-fg">Live activity</h1>
      <p className="mt-3 text-muted">{err.msg}</p>
      {err.code === "unauthorized" && <Link href="/login?next=/activity/live" className="mt-4 inline-block underline">Sign in</Link>}
    </div>
  );
  if (!d) return <div className="mx-auto max-w-content px-4 py-16 text-muted">Loading…</div>;
  const nowM = Math.floor(d.now / 60000), byM = new Map(d.series.map((x) => [Number(x.m), x.n]));
  const bars = Array.from({ length: 30 }, (_, i) => byM.get(nowM - 29 + i) ?? 0), max = Math.max(1, ...bars);
  const tmax = Math.max(1, ...d.topics.map((t) => t.n));
  const kpis = [["Active now (5 min)", d.active], ["Visitors (24 h)", d.totals.visitors], ["Events (24 h)", d.totals.events], ["Chat topics (24 h)", d.topics.reduce((a, t) => a + t.n, 0)]] as const;
  return (
    <div className="mx-auto max-w-content space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">Live activity</h1>
        <span className="flex items-center gap-2 text-xs text-muted"><span className="size-2 animate-pulse rounded-full bg-[#f97316]" />Live · every 3 s{err ? ` · ${err.msg}` : ""}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([l, v]) => <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{v}</p></Card>)}
      </div>
      <Card className="p-4">
        <p className="mb-2 text-xs text-muted">Events per minute · last 30 min</p>
        <div className="flex h-24 items-end gap-1">{bars.map((n, i) => <div key={i} title={`${n}`} className={`flex-1 rounded-sm ${i === bars.length - 1 ? "bg-[#f97316]" : "bg-neutral-600"}`} style={{ height: `${Math.max(2, (n / max) * 100)}%` }} />)}</div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-fg">Top pages · 1 h</p>
          {d.pages.length ? d.pages.map((p) => <div key={p.path} className="flex justify-between py-1 text-sm"><span className="truncate">{p.path}</span><span className="tabular-nums text-muted">{p.views} · {p.visitors}</span></div>) : <p className="text-sm text-muted">No page views in the last hour.</p>}
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-fg">Trending chat topics · 24 h</p>
          {d.topics.length ? d.topics.map((t) => <div key={t.topic} className="py-1"><div className="flex justify-between text-sm"><span>{t.topic}</span><span className="tabular-nums text-muted">{t.n}</span></div><div className="mt-1 h-1.5 rounded bg-neutral-800"><div className="h-1.5 rounded bg-neutral-400" style={{ width: `${(t.n / tmax) * 100}%` }} /></div></div>) : <p className="text-sm text-muted">No chat topics yet.</p>}
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-fg">Recent events</p>
          {d.recent.length ? d.recent.map((e, i) => <div key={i} className="flex gap-2 py-1 text-xs"><span className="truncate text-fg">{e.type === "pageview" ? e.path : e.type === "click" ? `${e.target} on ${e.path}` : `topic: ${e.topic}`}</span><span className="ml-auto shrink-0 text-subtle">{e.vid}{e.country ? ` · ${e.country}` : ""} · {ago(e.ts)}</span></div>) : <p className="text-sm text-muted">No events yet.</p>}
        </Card>
      </div>
      <p className="text-xs text-subtle">Only visitors who opted in are counted. No message text, IPs or browser details are stored.</p>
    </div>
  );
}
