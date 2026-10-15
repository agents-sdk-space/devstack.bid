"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Plus, Terminal, Trash2 } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { Credits } from "@/components/credits/credits";

type Client = { id: string; name: string; scopes: string[]; rateLimit: number; createdAt: number };

const ONE_LINER = "curl -fsSL https://devstack.bid/setup.sh | bash -s -- my-app";
const ONE_LINER_ENV = "read -rs DEVSTACK_KEY && export DEVSTACK_KEY && curl -fsSL https://devstack.bid/setup.sh | bash -s -- my-app";

/** /settings/cli — CLI keys (hashed, shown once, scope cli:setup only) + the macOS one-liner + starter zip download. */
export function CliKeys() {
  const { lang } = useLang();
  const th = lang === "th";
  const [clients, setClients] = useState<Client[]>([]);
  const [freshKey, setFreshKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starter, setStarter] = useState("my-app");

  const load = useCallback(async () => {
    const r = await fetch("/api/mcp/keys", { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error ?? "Could not load keys");
    return ((b.clients ?? []) as Client[]).filter((c) => c.scopes.length === 1 && c.scopes[0] === "cli:setup");
  }, []);

  useEffect(() => {
    let on = true;
    load().then((c) => on && setClients(c)).catch((e: unknown) => on && setError(e instanceof Error ? e.message : String(e)));
    return () => { on = false; };
  }, [load]);

  async function create() {
    setBusy(true); setError(""); setFreshKey("");
    try {
      const r = await fetch("/api/mcp/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `CLI ${new Date().toISOString().slice(0, 10)}`, scopes: ["cli:setup"] }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Could not create key");
      setFreshKey(b.key);
      setClients(await load());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/mcp/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not revoke key");
      setClients(await load()); setFreshKey("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const code = "block w-full overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs text-fg";
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2"><Terminal className="h-5 w-5" aria-hidden /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">CLI setup</h1>
          <p className="mt-1 text-sm text-subtle">{th ? "สร้างโปรเจกต์ใหม่จาก Terminal บน macOS (Apple Silicon) ได้ไฟล์ zip พร้อม deploy" : "Create a new project from the macOS (Apple Silicon) Terminal as a deploy-ready zip."}</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg">{error}</p>}

      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold text-fg">{th ? "1. สร้าง CLI key" : "1. Create a CLI key"}</h2>
        <p className="mt-1 text-sm text-subtle">{th ? "คีย์ใช้ได้แค่สร้างโปรเจกต์ (cli:setup) เก็บเป็นค่าแฮช แสดงครั้งเดียว เพิกถอนได้ทุกเมื่อ" : "Scoped to project setup only (cli:setup), stored hashed, shown once, revocable anytime."}</p>
        <button type="button" disabled={busy} onClick={() => void create()} className={buttonClasses("primary", "md", "mt-4")}><Plus className="h-4 w-4" aria-hidden />{th ? "สร้างคีย์" : "Create key"}</button>
        {freshKey && <div className="mt-4 rounded-xl border border-fg/30 p-4">
          <p className="text-sm font-semibold text-fg">{th ? "คัดลอกตอนนี้ ระบบจะไม่แสดงซ้ำ" : "Copy it now. It will not be shown again."}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className={`${code} break-all`}>{freshKey}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(freshKey)} className={buttonClasses("secondary", "sm")}><Copy className="h-4 w-4" aria-hidden />{th ? "คัดลอก" : "Copy"}</button>
          </div>
        </div>}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-base font-semibold text-fg">{th ? "2. วางคำสั่งใน Terminal" : "2. Paste in Terminal"}</h2>
        <p className="mt-1 text-sm text-subtle">{th ? "ระบบจะถามคีย์แบบซ่อนตัวอักษร ไม่ขึ้นจอและไม่ลงประวัติคำสั่ง เปลี่ยน my-app เป็นชื่อโปรเจกต์" : "It asks for the key with hidden input, so it never shows on screen or in shell history. Replace my-app with your project name."}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className={code}>{ONE_LINER}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(ONE_LINER)} className={buttonClasses("secondary", "sm")}><Copy className="h-4 w-4" aria-hidden />{th ? "คัดลอก" : "Copy"}</button></div>
        <p className="mt-3 text-xs text-subtle">{th ? "ใช้ซ้ำหลายครั้ง: พิมพ์คีย์ครั้งเดียวแบบซ่อน เก็บในตัวแปรของหน้าต่างนี้ คีย์ไม่ลงประวัติคำสั่ง" : "Reusing it: type the key once (hidden) into a variable for this window; it never enters shell history."}</p>
        <code className={`${code} mt-2`}>{ONE_LINER_ENV}</code>
        <p className="mt-3 text-xs text-subtle">{th ? "ผลลัพธ์: โฟลเดอร์ my-app และ my-app-deploy.zip นำไปอัปโหลดที่ /projects หรือรัน npx wrangler deploy เพิ่ม worker ท้ายคำสั่งถ้าต้องการ Worker แบบสคริปต์" : "Result: a my-app folder and my-app-deploy.zip. Upload it in /projects or run npx wrangler deploy. Append worker for a script Worker instead of a static site."}</p>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-base font-semibold text-fg">{th ? "ไม่ใช้ Terminal? ดาวน์โหลด zip เดียวกัน" : "No Terminal? Download the same zip"}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input aria-label={th ? "ชื่อโปรเจกต์" : "Project name"} value={starter} onChange={(e) => setStarter(e.target.value)} maxLength={63} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg" />
          <a href={`/api/cli/starter?template=static&name=${encodeURIComponent(starter)}`} className={buttonClasses("secondary", "md")}><Download className="h-4 w-4" aria-hidden />Static site</a>
          <a href={`/api/cli/starter?template=worker&name=${encodeURIComponent(starter)}`} className={buttonClasses("secondary", "md")}><Download className="h-4 w-4" aria-hidden />Worker</a>
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-fg">{th ? "CLI key ที่ใช้งานอยู่" : "Active CLI keys"}</h2>
        {clients.length === 0 ? <p className="mt-3 text-sm text-subtle">{th ? "ยังไม่มีคีย์" : "No active keys."}</p> : <ul className="mt-3 space-y-3">
          {clients.map((c) => <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-fg">{c.name}</p><p className="mt-1 text-xs text-subtle">cli:setup · {c.rateLimit}/min</p></div>
            <button type="button" disabled={busy} onClick={() => void revoke(c.id)} className={buttonClasses("ghost", "sm")}><Trash2 className="h-4 w-4" aria-hidden />{th ? "เพิกถอน" : "Revoke"}</button>
          </li>)}
        </ul>}
      </section>
      <Credits className="mt-10" />
    </div>
  );
}
