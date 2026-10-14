"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";

type Client = { id: string; name: string; scopes: string[]; rateLimit: number; createdAt: number };
type Scope = { id: string; label: string };
const SCOPES: Scope[] = [
  { id: "plan:write", label: "AI planner" },
  { id: "chat:read", label: "Read chat history" },
  { id: "chat:write", label: "User Chat (including images)" },
  { id: "dev:write", label: "Dev Chat orchestrator" },
  { id: "factory:write", label: "Sandbox Factory" },
  { id: "github:read", label: "List GitHub repositories" },
  { id: "github:write", label: "Commit files to GitHub" },
];

export function McpKeys() {
  const { lang } = useLang();
  const th = lang === "th";
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["plan:write", "chat:read", "chat:write"]);
  const [freshKey, setFreshKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/mcp/keys", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? (th ? "โหลดคีย์ไม่สำเร็จ" : "Could not load keys"));
    setClients(body.clients ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/mcp/keys", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (th ? "โหลดคีย์ไม่สำเร็จ" : "Could not load keys"));
        if (active) setClients(body.clients ?? []);
      })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [th]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setFreshKey("");
    try {
      const response = await fetch("/api/mcp/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? (th ? "สร้างคีย์ไม่สำเร็จ" : "Could not create key"));
      setFreshKey(body.key);
      setName("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/mcp/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? (th ? "เพิกถอนคีย์ไม่สำเร็จ" : "Could not revoke key"));
      await refresh();
      setFreshKey("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2"><KeyRound className="h-5 w-5" aria-hidden /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">MCP integrations</h1>
          <p className="mt-1 text-sm text-subtle">{th ? "เชื่อมเครื่องมือของ DevStack กับ AI platform อื่น" : "Connect DevStack tools to other AI platforms."}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-subtle">{th ? "ความเป็นส่วนตัว: คีย์จะแสดงครั้งเดียวและจัดเก็บเป็นค่าแฮช เลือกสิทธิ์เท่าที่จำเป็น และเพิกถอนคีย์ได้ทันที ข้อความที่ส่งผ่านเครื่องมือแชตอาจถูกส่งต่อไปยังผู้ให้บริการ AI ตามโหมดที่เลือก อย่าส่งรหัสผ่าน OTP recovery code API key หรือข้อมูลตำแหน่งส่วนตัว" : "Privacy: keys are shown once, stored as hashes, scoped to the access you select, and can be revoked. Prompts sent through chat tools may be forwarded to the AI provider for the selected mode. Never send passwords, one-time or recovery codes, API keys, or private location details."}</p>

      {error && <p className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}

      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold text-fg">{th ? "สร้าง API key" : "Create an API key"}</h2>
        <p className="mt-1 text-sm text-subtle">{th ? "เลือกเฉพาะสิทธิ์ที่ platform นี้ต้องใช้ คีย์จะแสดงครั้งเดียว" : "Grant only the scopes this platform needs. The key is shown once."}</p>
        <form onSubmit={createKey} className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-fg">
            {th ? "ชื่อการเชื่อมต่อ" : "Connection name"}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent" placeholder={th ? "เช่น Cursor ส่วนตัว" : "e.g. Cursor personal"} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-fg">{th ? "สิทธิ์" : "Scopes"}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SCOPES.map((scope) => (
                <label key={scope.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm text-fg">
                  <input type="checkbox" checked={scopes.includes(scope.id)} onChange={(e) => setScopes((old) => e.target.checked ? [...old, scope.id] : old.filter((x) => x !== scope.id))} className="mt-0.5 accent-sky-500" />
                  <span>{scope.label}<span className="block font-mono text-[11px] text-subtle">{scope.id}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {scopes.some((scope) => scope.startsWith("github:")) && <p className="text-xs text-subtle">{th ? "สิทธิ์ GitHub ใช้ได้เมื่อบัญชี DevStack นี้เข้าสู่ระบบด้วย GitHub" : "GitHub scopes require a DevStack account signed in with GitHub."}</p>}
          <button disabled={busy || !name.trim() || scopes.length === 0} className={buttonClasses("primary", "md")}><Plus className="h-4 w-4" aria-hidden />{th ? "สร้างคีย์" : "Create key"}</button>
        </form>
        {freshKey && <div className="mt-5 rounded-xl border border-sky-400/30 bg-sky-400/5 p-4">
          <p className="text-sm font-semibold text-fg">{th ? "คัดลอกคีย์นี้ตอนนี้ ระบบจะไม่แสดงซ้ำ" : "Copy this key now. It will not be shown again."}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-black/40 p-3 text-xs text-sky-100">{freshKey}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(freshKey)} className={buttonClasses("secondary", "sm")}><Copy className="h-4 w-4" aria-hidden />{th ? "คัดลอก" : "Copy"}</button>
          </div>
          <p className="mt-3 text-xs text-subtle">{th ? "ตั้งค่า server URL เป็น https://devstack.bid/mcp และส่งคีย์เป็น Authorization: Bearer …" : "Set the server URL to https://devstack.bid/mcp and send the key as Authorization: Bearer …"}</p>
        </div>}
      </Card>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-fg">{th ? "คีย์ที่ใช้งานอยู่" : "Active keys"}</h2>
        {clients.length === 0 ? <p className="mt-3 text-sm text-subtle">{th ? "ยังไม่มี key" : "No active keys yet."}</p> : <ul className="mt-3 space-y-3">
          {clients.map((client) => <li key={client.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-fg">{client.name}</p><p className="mt-1 text-xs text-subtle">{client.scopes.join(" · ")} · {client.rateLimit}/min</p></div>
            <button type="button" disabled={busy} onClick={() => void revoke(client.id)} className={buttonClasses("ghost", "sm", "text-red-300")}><Trash2 className="h-4 w-4" aria-hidden />{th ? "เพิกถอน" : "Revoke"}</button>
          </li>)}
        </ul>}
      </section>
    </div>
  );
}
