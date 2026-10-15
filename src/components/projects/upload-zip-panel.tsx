"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";

/** Upload a deploy zip (CLI / Download zip format) → creates or updates an upload project, then optionally deploys. */
export function UploadZipPanel({ projectId, onDone }: { projectId?: string; onDone?: (id: string) => void }) {
  const { lang } = useLang();
  const th = lang === "th";
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(deploy: boolean) {
    const file = input.current?.files?.[0];
    if (!file) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const form = new FormData();
      form.set("file", file);
      if (projectId) form.set("projectId", projectId);
      const r = await fetch("/api/projects/upload", { method: "POST", body: form });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${b.error ?? "Upload failed"}${b.path ? ` (${b.path})` : ""}`);
      const id = b.project.id as string;
      setMsg(`${th ? "อัปโหลดแล้ว" : "Uploaded"} ${b.files} ${th ? "ไฟล์" : "files"}${b.stripped?.length ? ` · ${th ? "ตัดออก" : "removed"}: ${b.stripped.join(", ")}` : ""}`);
      if (deploy) {
        const d = await fetch(`/api/projects/${encodeURIComponent(id)}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const db = await d.json().catch(() => ({}));
        if (!d.ok) throw new Error(db.error ?? "Deploy failed to start");
      }
      onDone?.(id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-base font-semibold text-fg">{projectId ? (th ? "อัปโหลด zip ใหม่" : "Upload a new zip") : (th ? "Deploy จากไฟล์ zip" : "Deploy from a zip")}</h2>
      <p className="mt-1 text-sm text-subtle">{th ? "ใช้ zip จากคำสั่ง setup หรือปุ่ม Download zip ไม่ต้องมี GitHub ต้องเชื่อม Cloudflare ที่ /settings/connections" : "Use a zip from the setup command or a Download zip button. No GitHub needed; connect Cloudflare in /settings/connections."}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".zip,application/zip" aria-label={th ? "ไฟล์ zip" : "Zip file"} className="text-sm text-fg file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-fg" />
        <button type="button" disabled={busy} onClick={() => void submit(true)} className={buttonClasses("primary", "md")}><Upload className="h-4 w-4" aria-hidden />{th ? "อัปโหลดและ Deploy" : "Upload & deploy"}</button>
        <button type="button" disabled={busy} onClick={() => void submit(false)} className={buttonClasses("secondary", "md")}>{th ? "อัปโหลดอย่างเดียว" : "Upload only"}</button>
      </div>
      {msg && <p className="mt-3 text-sm text-subtle" aria-live="polite">{msg}</p>}
      {err && <p role="alert" className="mt-3 rounded-lg border border-fg/40 px-3 py-2 text-sm text-fg">{err}</p>}
    </Card>
  );
}
