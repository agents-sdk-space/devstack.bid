"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, GitBranch, KeyRound, ShieldCheck } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { CreateTokenMenu } from "@/components/tokens/create-token-menu";
import { RememberToggle } from "@/components/tokens/remember-toggle";

type Conn = { kind: string; label: string; masked: string; last4: string; scopes: string[]; accountId?: string; verifiedAt: number | null };

const input = "mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-fg";

/**
 * /settings/connections — the customer links their own GitHub, Cloudflare and OpenAI accounts.
 * Keys go to the server once (PUT), are validated with the provider, sealed, and only ever come
 * back masked (••••last4). Inputs are cleared after submit and never stored in the browser.
 */
export function ConnectionsPanel() {
  const { lang } = useLang();
  const th = lang === "th";
  const [conns, setConns] = useState<Conn[]>([]);
  const [encryption, setEncryption] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [cf, setCf] = useState({ token: "", accountId: "" });
  const [oai, setOai] = useState("");
  const [rememberCf, setRememberCf] = useState(false);
  const [rememberOai, setRememberOai] = useState(false);
  const [events, setEvents] = useState<{ event: string; subject: string | null; at: number }[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  async function loadAudit() {
    setShowAudit((v) => !v);
    const r = await fetch("/api/connections/audit", { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    if (r.ok) setEvents(b.events ?? []);
  }

  const refresh = useCallback(async () => {
    const b = await loadConnections();
    setConns(b.connections);
    setEncryption(b.encryption);
  }, []);

  useEffect(() => {
    let active = true;
    loadConnections()
      .then((b) => { if (active) { setConns(b.connections); setEncryption(b.encryption); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, []);

  async function call(kind: string, method: "PUT" | "DELETE", body?: unknown) {
    setBusy(kind); setError(""); setNotice("");
    try {
      const r = await fetch(`/api/connections/${kind}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Request failed");
      setNotice(method === "DELETE" ? (th ? "ยกเลิกการเชื่อมต่อแล้ว" : "Disconnected") : b.remembered ? (th ? "ตรวจสอบและบันทึกแล้ว" : "Verified and saved") : (th ? "ตรวจสอบแล้ว ไม่ได้บันทึก (ติ๊ก “จำไว้” เพื่อเก็บ)" : "Verified, not saved (tick “Remember” to keep it)"));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
      setCf({ token: "", accountId: cf.accountId });
      setOai("");
    }
  }

  const find = (k: string) => conns.find((c) => c.kind === k);
  const gh = find("github");
  const cfc = find("cloudflare");
  const oc = find("openai");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{th ? "การเชื่อมต่อ" : "Connections"}</h1>
      <p className="mt-1 text-sm text-subtle">{th ? "ผูกบัญชีของคุณเอง เพื่อสร้าง repo เปิด PR และ deploy เข้าบัญชีของคุณ" : "Link your own accounts to create repos, open PRs and deploy into your account."}</p>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-subtle">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {th
          ? "คีย์ถูกตรวจกับผู้ให้บริการก่อนบันทึก เก็บแบบเข้ารหัส (AES-GCM) ฝั่งเซิร์ฟเวอร์ แสดงแค่ 4 ตัวท้าย และลบได้ทุกเมื่อ ไม่มีการส่งคีย์กลับมาที่เบราว์เซอร์"
          : "Keys are verified with the provider before saving, stored encrypted (AES-GCM) on the server, shown only as the last 4 characters, and can be removed at any time. Keys are never sent back to the browser."}
        {encryption === "v1" && <span className="font-mono"> (legacy key mode)</span>}{" "}
        <a href="/docs/user-guide/customer-deploy#privacy--ความเป็นส่วนตัว" className="underline underline-offset-4 hover:text-fg">{th ? "นโยบายความเป็นส่วนตัว" : "Privacy"}</a>
      </p>

      <div aria-live="polite" className="mt-4 min-h-5 text-sm">
        {error && <p role="alert" className="rounded-lg border border-fg/40 px-3 py-2 text-fg">{error}</p>}
        {notice && !error && <p className="text-subtle">{notice}</p>}
      </div>

      <div className="mt-4 grid gap-4">
        <Card className="p-5">
          <Row icon={<GitBranch className="h-5 w-5" aria-hidden />} title="GitHub" status={gh ? `${gh.label} · ${gh.scopes.join(" ")}` : th ? "ยังไม่เชื่อมต่อ" : "Not connected"} />
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/auth/github?next=/settings/connections" className={buttonClasses(gh ? "secondary" : "primary", "sm")}>{gh ? (th ? "เชื่อมต่อใหม่" : "Reconnect") : th ? "เชื่อมต่อ GitHub" : "Connect GitHub"}</a>
            <a href="/api/auth/github?scope=public&next=/settings/connections" className={buttonClasses("ghost", "sm")}>{th ? "เฉพาะ repo สาธารณะ" : "Public repos only"}</a>
            {gh && <button type="button" disabled={busy === "github"} onClick={() => call("github", "DELETE")} className={buttonClasses("ghost", "sm")}>{th ? "ยกเลิกการเชื่อมต่อ" : "Disconnect"}</button>}
          </div>
        </Card>

        <Card className="p-5">
          <Row icon={<Cloud className="h-5 w-5" aria-hidden />} title="Cloudflare" status={cfc ? `${cfc.label} · ${cfc.accountId ?? ""} · ${cfc.masked}` : th ? "ยังไม่เชื่อมต่อ" : "Not connected"} />
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); call("cloudflare", "PUT", { ...cf, remember: rememberCf }); }}>
            <label className="text-sm font-medium text-fg">API token<input type="password" autoComplete="off" value={cf.token} onChange={(e) => setCf({ ...cf, token: e.target.value })} className={input} placeholder="••••" /></label>
            <label className="text-sm font-medium text-fg">Account ID<input value={cf.accountId} onChange={(e) => setCf({ ...cf, accountId: e.target.value })} className={input} placeholder="32 hex characters" /></label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <RememberToggle checked={rememberCf} onCheckedChange={setRememberCf} />
              <button disabled={busy === "cloudflare" || !cf.token || !cf.accountId} className={buttonClasses("primary", "sm")}>{rememberCf ? (th ? "ตรวจสอบและบันทึก" : "Verify & save") : th ? "ตรวจสอบ" : "Verify"}</button>
              <CreateTokenMenu primary="cloudflare" />
              {cfc && <button type="button" onClick={() => call("cloudflare", "DELETE")} className={buttonClasses("ghost", "sm")}>{th ? "ลบ" : "Remove"}</button>}
              <a href="/docs/user-guide/customer-deploy#cloudflare-token" className="text-xs text-subtle underline underline-offset-4 hover:text-fg">{th ? "วิธีสร้าง token (Workers Scripts: Edit + Account Settings: Read)" : "How to create a token (Workers Scripts: Edit + Account Settings: Read)"}</a>
            </div>
          </form>
        </Card>

        <Card className="p-5">
          <Row icon={<KeyRound className="h-5 w-5" aria-hidden />} title="OpenAI" status={oc ? oc.masked : th ? "ไม่บังคับ" : "Optional"} />
          <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); call("openai", "PUT", { key: oai, remember: rememberOai }); }}>
            <label className="min-w-64 flex-1 text-sm font-medium text-fg">API key<input type="password" autoComplete="off" value={oai} onChange={(e) => setOai(e.target.value)} className={input} placeholder="sk-…" /></label>
            <RememberToggle checked={rememberOai} onCheckedChange={setRememberOai} />
            <button disabled={busy === "openai" || !oai} className={buttonClasses("primary", "sm")}>{rememberOai ? (th ? "ตรวจสอบและบันทึก" : "Verify & save") : th ? "ตรวจสอบ" : "Verify"}</button>
            <CreateTokenMenu primary="openai" />
            {oc && <button type="button" onClick={() => call("openai", "DELETE")} className={buttonClasses("ghost", "sm")}>{th ? "ลบ" : "Remove"}</button>}
          </form>
        </Card>
      </div>

      <div className="mt-8">
        <button type="button" onClick={loadAudit} aria-expanded={showAudit} className="text-sm text-subtle underline underline-offset-4 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg">
          {th ? "ประวัติการใช้งาน (audit log)" : "Activity (audit log)"}
        </button>
        {showAudit && (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border font-mono text-xs">
            {events.length === 0 && <li className="px-3 py-2 text-subtle">—</li>}
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3 px-3 py-2">
                <span className="text-subtle">{new Date(e.at).toLocaleString()}</span>
                <span className="text-fg">{e.event}</span>
                <span className="truncate text-subtle">{e.subject}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

async function loadConnections(): Promise<{ connections: Conn[]; encryption: string }> {
  const r = await fetch("/api/connections", { cache: "no-store" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Could not load connections");
  return { connections: b.connections ?? [], encryption: b.encryption ?? "" };
}

function Row({ icon, title, status }: { icon: React.ReactNode; title: string; status: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border">{icon}</span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        <p className="truncate font-mono text-xs text-subtle">{status}</p>
      </div>
    </div>
  );
}
