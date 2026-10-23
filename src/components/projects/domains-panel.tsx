"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, RefreshCw, Trash2 } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";

type Rec = { type: "CNAME" | "TXT"; name: string; value: string; purpose: string };
type Domain = { id: string; hostname: string; status: string; sslStatus: string | null; live: boolean; records: Rec[]; errors: string[] };

/** Project settings → custom domains (Cloudflare for SaaS). Shows the DNS records to add and live status. */
export function DomainsPanel({ projectId }: { projectId: string }) {
  const { lang } = useLang();
  const th = lang === "th";
  const base = `/api/projects/${encodeURIComponent(projectId)}/domains`;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const fetchState = useCallback(async () => {
    const r = await fetch(base, { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return { ok: r.ok, b };
  }, [base]);
  const apply = useCallback(({ ok, b }: { ok: boolean; b: { error?: string; enabled?: boolean; domains?: Domain[] } }) => {
    if (!ok) { setErr(b.error ?? "Failed to load domains"); return; }
    setEnabled(!!b.enabled); setDomains(b.domains ?? []);
  }, []);
  const load = useCallback(async () => apply(await fetchState()), [apply, fetchState]);
  useEffect(() => { fetchState().then(apply, () => setErr("Failed to load domains")); }, [fetchState, apply]);

  async function act(key: string, url: string, init: RequestInit) {
    setBusy(key); setErr("");
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
      if (key === "add") setHost("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  const statusText = (d: Domain) => d.live ? (th ? "ใช้งานได้" : "Live") : d.errors.length ? (th ? "มีปัญหา" : "Needs attention") : (th ? "รอตรวจสอบ DNS" : "Waiting for DNS");

  return (
    <Card className="mt-6 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-fg"><Globe className="h-4 w-4" aria-hidden />{th ? "โดเมนของคุณเอง" : "Custom domains"}</h2>
      <p className="mt-1 text-sm text-subtle">{th ? "ใส่โดเมน แล้วเพิ่มระเบียน DNS ตามที่แสดง ใบรับรอง HTTPS ออกให้อัตโนมัติ" : "Add a domain, then create the DNS records shown. HTTPS certificates are issued automatically."}</p>
      {enabled === false && <p role="status" className="mt-3 text-sm text-fg">{th ? "ระบบโดเมนของคุณเองยังไม่เปิดใช้งานบนแพลตฟอร์มนี้" : "Custom domains are not enabled on this platform yet."}</p>}
      {enabled && (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void act("add", base, { method: "POST", body: JSON.stringify({ hostname: host }) }); }}>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" aria-label={th ? "โดเมน" : "Domain"} className="min-w-56 flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg" />
          <button type="submit" disabled={!!busy || !host.trim()} className={buttonClasses("primary", "md")}>{th ? "เพิ่มโดเมน" : "Add domain"}</button>
        </form>
      )}
      <ul className="mt-4 flex flex-col gap-4">
        {domains.map((d) => (
          <li key={d.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {d.live ? <a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer" className="font-medium text-fg underline">{d.hostname}</a> : <span className="font-medium text-fg">{d.hostname}</span>}
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-subtle" data-status={d.status}>{statusText(d)} · {d.status}{d.sslStatus ? ` / SSL ${d.sslStatus}` : ""}</span>
              <span className="ml-auto flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => void act(`v-${d.id}`, `${base}/${d.id}`, { method: "POST", body: "{}" })} className={buttonClasses("secondary", "sm")}><RefreshCw className="h-3.5 w-3.5" aria-hidden />{th ? "ตรวจสอบ" : "Verify"}</button>
                <button type="button" disabled={!!busy} onClick={() => { if (confirm(th ? `ลบ ${d.hostname}?` : `Remove ${d.hostname}?`)) void act(`d-${d.id}`, `${base}/${d.id}`, { method: "DELETE" }); }} className={buttonClasses("secondary", "sm")}><Trash2 className="h-3.5 w-3.5" aria-hidden />{th ? "ลบ" : "Remove"}</button>
              </span>
            </div>
            {!d.live && d.records.length > 0 && (
              <table className="mt-3 w-full table-fixed text-left text-xs">
                <thead className="text-subtle"><tr><th className="w-16">Type</th><th>Name</th><th>Value</th></tr></thead>
                <tbody>{d.records.map((r) => <tr key={r.type + r.name + r.value} className="align-top text-fg"><td>{r.type}</td><td className="break-all pr-2 font-mono">{r.name}</td><td className="break-all font-mono">{r.value}</td></tr>)}</tbody>
              </table>
            )}
            {d.errors.map((e) => <p key={e} className="mt-2 text-xs text-fg">{e}</p>)}
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="mt-3 rounded-lg border border-fg/40 px-3 py-2 text-sm text-fg">{err}</p>}
    </Card>
  );
}
