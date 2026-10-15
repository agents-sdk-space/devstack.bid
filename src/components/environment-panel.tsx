"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { CreateTokenMenu } from "@/components/tokens/create-token-menu";

type EnvEntry = { name: string; provider: string | null; createdAt: number; updatedAt: number; lastUsedAt: number | null };
type ConnEntry = { kind: string; label: string; verifiedAt: number | null };

const CONN_NAME: Record<string, string> = { cloudflare: "CLOUDFLARE_API_TOKEN", openai: "OPENAI_API_KEY", github: "GITHUB_OAUTH_TOKEN" };
const input = "mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-fg";

/**
 * /settings/environment — secrets the user ticked "Remember" for. Shows name + dates only.
 * Values are write-only from the browser: they go to the server once and never come back.
 */
export function EnvironmentPanel() {
  const { lang } = useLang();
  const th = lang === "th";
  const [env, setEnv] = useState<EnvEntry[]>([]);
  const [conns, setConns] = useState<ConnEntry[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState({ name: "", value: "" });
  const fmt = (t: number | null) => (t ? new Date(t).toLocaleString(th ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");

  const load = useCallback(async () => {
    const b = await fetchEnvironment();
    setEnv(b.env);
    setConns(b.connections);
  }, []);

  useEffect(() => {
    let active = true;
    fetchEnvironment()
      .then((b) => { if (active) { setEnv(b.env); setConns(b.connections); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, []);

  async function run(key: string, fn: () => Promise<Response>, ok: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      const r = await fn();
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Request failed");
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const body = JSON.stringify({ name: draft.name.trim().toUpperCase(), value: draft.value });
    setDraft({ name: draft.name, value: "" });
    void run("add", () => fetch("/api/environment", { method: "POST", headers: { "Content-Type": "application/json" }, body }), th ? "บันทึกแล้ว" : "Saved");
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Environment</h1>
      <p className="mt-1 text-sm text-subtle">
        {th ? "คีย์ที่คุณเลือก “จำไว้” บอทและการ deploy ใช้ได้ ไม่แสดงค่าจริงที่นี่" : "Keys you chose to “Remember”. The chat bot and deploys can use them. Values are never shown here."}
      </p>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-subtle">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {th ? "เข้ารหัส AES-GCM ด้วยคีย์ที่เก็บใน Cloudflare Secrets Store ลบได้ทุกเมื่อ" : "Encrypted with AES-GCM using a key held in Cloudflare Secrets Store. Delete any time."}
      </p>

      <div aria-live="polite" className="mt-4 min-h-5 text-sm">
        {error && <p role="alert" className="rounded-lg border border-fg/40 px-3 py-2 text-fg">{error}</p>}
        {notice && !error && <p className="text-subtle">{notice}</p>}
      </div>

      <Card className="mt-4 overflow-hidden">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{th ? "รายการ Environment" : "Environment entries"}</caption>
          <thead className="border-b border-border text-xs text-subtle">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">{th ? "ชื่อ" : "Name"}</th>
              <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">{th ? "สร้าง" : "Created"}</th>
              <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">{th ? "แก้ไข" : "Updated"}</th>
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">{th ? "ใช้ล่าสุด" : "Last used"}</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">{th ? "ลบ" : "Delete"}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {conns.map((c) => (
              <tr key={`c-${c.kind}`}>
                <td className="px-4 py-2.5 font-mono text-fg">{CONN_NAME[c.kind] ?? c.kind.toUpperCase()} <span className="ml-1 font-sans text-xs text-subtle">({th ? "การเชื่อมต่อ" : "connection"})</span></td>
                <td className="hidden px-4 py-2.5 text-subtle sm:table-cell">—</td>
                <td className="hidden px-4 py-2.5 text-subtle sm:table-cell">{fmt(c.verifiedAt)}</td>
                <td className="hidden px-4 py-2.5 text-subtle md:table-cell">—</td>
                <td className="px-4 py-2.5 text-right">
                  <button type="button" disabled={busy === c.kind} onClick={() => run(c.kind, () => fetch(`/api/connections/${c.kind}`, { method: "DELETE" }), th ? "ลบแล้ว" : "Deleted")} className={buttonClasses("ghost", "sm")} aria-label={`${th ? "ลบ" : "Delete"} ${CONN_NAME[c.kind] ?? c.kind}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
            {env.map((e) => (
              <tr key={e.name}>
                <td className="px-4 py-2.5 font-mono text-fg">{e.name}</td>
                <td className="hidden px-4 py-2.5 text-subtle sm:table-cell">{fmt(e.createdAt)}</td>
                <td className="hidden px-4 py-2.5 text-subtle sm:table-cell">{fmt(e.updatedAt)}</td>
                <td className="hidden px-4 py-2.5 text-subtle md:table-cell">{fmt(e.lastUsedAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <button type="button" disabled={busy === e.name} onClick={() => run(e.name, () => fetch(`/api/environment/${encodeURIComponent(e.name)}`, { method: "DELETE" }), th ? "ลบแล้ว" : "Deleted")} className={buttonClasses("ghost", "sm")} aria-label={`${th ? "ลบ" : "Delete"} ${e.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
            {env.length + conns.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-subtle">{th ? "ยังไม่มีคีย์ที่จำไว้" : "Nothing remembered yet."}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fg">{th ? "เพิ่มคีย์" : "Add a key"}</h2>
          <CreateTokenMenu />
        </div>
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={add}>
          <label className="text-sm font-medium text-fg">{th ? "ชื่อ" : "Name"}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} placeholder="VERCEL_TOKEN" pattern="[A-Za-z][A-Za-z0-9_]{1,63}" autoComplete="off" spellCheck={false} /></label>
          <label className="text-sm font-medium text-fg">{th ? "ค่า" : "Value"}<input type="password" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className={input} placeholder="••••" autoComplete="off" spellCheck={false} /></label>
          <button disabled={busy === "add" || !draft.name || !draft.value} className={buttonClasses("primary", "sm")}>{th ? "บันทึก" : "Save"}</button>
        </form>
      </Card>
    </div>
  );
}

async function fetchEnvironment(): Promise<{ env: EnvEntry[]; connections: ConnEntry[] }> {
  const r = await fetch("/api/environment", { cache: "no-store" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Could not load environment");
  return { env: b.env ?? [], connections: b.connections ?? [] };
}
