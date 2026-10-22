"use client";

import { useState } from "react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";

/** /cli/device — the signed-in user confirms the code shown in their terminal. Never auto-approves. */
export function DeviceApprove({ initialCode = "" }: { initialCode?: string }) {
  const { lang } = useLang();
  const th = lang === "th";
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, 9));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(approve: boolean) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/cli/device/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userCode: code, approve }) });
      const b = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
      if (r.status === 401) { window.location.href = `/login?next=${encodeURIComponent(`/cli/device?code=${code}`)}`; return; }
      if (!r.ok) { setErr(b.error ?? `HTTP ${r.status}`); return; }
      setMsg(approve ? (th ? "อนุมัติแล้ว กลับไปที่ terminal ได้เลย" : "Approved. Return to your terminal.") : (th ? "ปฏิเสธแล้ว" : "Denied."));
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-fg">{th ? "อนุมัติการเข้าสู่ระบบจาก CLI" : "Approve CLI sign-in"}</h1>
        <p className="mt-2 text-sm text-subtle">{th ? "ตรวจว่ารหัสตรงกับที่แสดงใน terminal ของคุณ ถ้าคุณไม่ได้สั่ง devstack login เอง ให้กดปฏิเสธ" : "Check the code matches your terminal. If you did not run devstack login yourself, deny."}</p>
        <label className="mt-4 block text-sm text-fg" htmlFor="code">{th ? "รหัส" : "Code"}</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-lg tracking-widest" autoComplete="off" />
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy || !code} onClick={() => decide(true)} className={buttonClasses("primary")}>{th ? "อนุมัติ" : "Approve"}</button>
          <button type="button" disabled={busy || !code} onClick={() => decide(false)} className={buttonClasses("secondary")}>{th ? "ปฏิเสธ" : "Deny"}</button>
        </div>
        {msg && <p role="status" className="mt-3 text-sm text-fg">{msg}</p>}
        {err && <p role="alert" className="mt-3 text-sm text-red-500">{err}</p>}
      </Card>
    </main>
  );
}
