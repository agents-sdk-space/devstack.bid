"use client";

import { useState } from "react";
import { buttonClasses, Card, Select, Textarea } from "@/components/ui";
import { useLang } from "@/components/prefs";

const REASONS = ["phishing", "malware", "spam", "illegal", "impersonation", "other"] as const;
const T = {
  en: { title: "Report a site", site: "Site", reason: "Reason", details: "Details (optional)", send: "Send report", sent: "Report received. Our team will review it.", invalid: "This is not a devstack.bid user site.", phishing: "Phishing or credential theft", malware: "Malware", spam: "Spam", illegal: "Illegal content", impersonation: "Impersonates DevStack or another brand", other: "Other" },
  th: { title: "รายงานเว็บไซต์", site: "เว็บไซต์", reason: "เหตุผล", details: "รายละเอียด (ไม่บังคับ)", send: "ส่งรายงาน", sent: "ได้รับรายงานแล้ว ทีมงานจะตรวจสอบ", invalid: "นี่ไม่ใช่เว็บของผู้ใช้ devstack.bid", phishing: "หลอกขโมยข้อมูล/รหัสผ่าน", malware: "มัลแวร์", spam: "สแปม", illegal: "เนื้อหาผิดกฎหมาย", impersonation: "แอบอ้างเป็น DevStack หรือแบรนด์อื่น", other: "อื่นๆ" },
} as const;

export function ReportForm({ site }: { site: string }) {
  const { lang } = useLang();
  const t = T[lang === "th" ? "th" : "en"];
  const [reason, setReason] = useState<(typeof REASONS)[number]>("phishing");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "sent" | "error"; msg?: string }>({ kind: "idle" });
  const valid = /^[a-z0-9-]+\.devstack\.bid$/.test(site);
  async function submit() {
    setState({ kind: "busy" });
    const r = await fetch("/api/site-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, reason, details }) });
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    setState(r.ok ? { kind: "sent" } : { kind: "error", msg: b.error ?? `HTTP ${r.status}` });
  }
  return (
    <main className="mx-auto max-w-lg p-4">
      <Card className="space-y-3 p-5">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="text-sm">{t.site}: <span className="font-mono">{site || "-"}</span></p>
        {!valid ? <p className="text-sm text-danger" role="alert">{t.invalid}</p> : state.kind === "sent" ? <p role="status" className="text-sm">{t.sent}</p> : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <label className="block text-sm">{t.reason}
              <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>{REASONS.map((r) => <option key={r} value={r}>{t[r]}</option>)}</Select>
            </label>
            <label className="block text-sm">{t.details}<Textarea value={details} maxLength={1000} rows={4} onChange={(e) => setDetails(e.target.value)} /></label>
            <button className={buttonClasses("primary", "md")} disabled={state.kind === "busy"}>{t.send}</button>
            {state.kind === "error" && <p className="text-sm text-danger" role="alert">{state.msg}</p>}
          </form>
        )}
      </Card>
    </main>
  );
}
