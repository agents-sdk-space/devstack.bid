"use client";

import { useEffect, useState } from "react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";

type Info = { clientName: string; createdAt: number; ip: string | null; country: string | null; account: string | null };
type Phase = "checking" | "signed_out" | "enter" | "review" | "done";

const ERRORS: Record<string, [string, string]> = {
  invalid: ["That code doesn't look right. Check your terminal.", "รหัสไม่ถูกต้อง ตรวจดูใน terminal อีกครั้ง"],
  not_found: ["Code not found or expired. Run devstack login again.", "ไม่พบรหัสหรือหมดอายุแล้ว สั่ง devstack login ใหม่"],
  key_limit: ["You have 20 active keys. Revoke one in Settings → CLI.", "มีคีย์ครบ 20 อันแล้ว เพิกถอนบางอันในหน้าตั้งค่า CLI ก่อน"],
  rate_limited: ["Too many attempts. Wait a minute.", "ลองบ่อยเกินไป รอสักครู่"],
  unauthorized: ["Please sign in first.", "กรุณาเข้าสู่ระบบก่อน"],
  forbidden: ["Request blocked. Reload the page.", "คำขอถูกปฏิเสธ โหลดหน้าใหม่"],
};

/** /cli/device — signed-in user types the code from their terminal, reviews the request, then approves or denies. */
export function DeviceApprove() {
  const { lang } = useLang();
  const th = lang === "th";
  const t = (en: string, thai: string) => (th ? thai : en);
  const [phase, setPhase] = useState<Phase>("checking");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [deploy, setDeploy] = useState(false);
  const [result, setResult] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/cli/activity", { cache: "no-store" })
      .then((r) => { if (live) setPhase(r.status === 401 ? "signed_out" : "enter"); })
      .catch(() => { if (live) setPhase("enter"); });
    return () => { live = false; };
  }, []);

  const showErr = (c: string | undefined, status: number) => setErr(ERRORS[c ?? ""]?.[th ? 1 : 0] ?? t(`Something went wrong (HTTP ${status}).`, `เกิดข้อผิดพลาด (HTTP ${status})`));

  async function review() {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/cli/device?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const b = (await r.json().catch(() => ({}))) as Info & { code?: string };
      if (!r.ok) { if (r.status === 401) setPhase("signed_out"); showErr(b.code, r.status); return; }
      setInfo(b); setPhase("review");
    } finally { setBusy(false); }
  }

  async function decide(approve: boolean) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cli/device/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userCode: code, approve, deploy: approve && deploy }) });
      const b = (await r.json().catch(() => ({}))) as { code?: string };
      if (!r.ok) { showErr(b.code, r.status); return; }
      setResult(approve ? t("Approved. Return to your terminal.", "อนุมัติแล้ว กลับไปที่ terminal ได้เลย") : t("Denied. The terminal will stop waiting.", "ปฏิเสธแล้ว terminal จะหยุดรอ"));
      setPhase("done");
    } finally { setBusy(false); }
  }

  const clean = (v: string) => v.toUpperCase().replace(/\s+/g, "").slice(0, 9);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-fg">{t("Approve CLI sign-in", "อนุมัติการเข้าสู่ระบบจาก CLI")}</h1>
        <p role="note" className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-sm text-fg">
          {t("Approve only if you just ran devstack login yourself. If someone sent you this link or a code, deny it.", "อนุมัติเฉพาะเมื่อคุณเพิ่งสั่ง devstack login ด้วยตัวเองเท่านั้น ถ้ามีคนส่งลิงก์หรือรหัสนี้มาให้ ให้กดปฏิเสธ")}
        </p>

        {phase === "checking" && <p className="mt-4 text-sm text-subtle">{t("Checking your session…", "กำลังตรวจสอบการเข้าสู่ระบบ…")}</p>}

        {phase === "signed_out" && (
          <a className={`mt-4 ${buttonClasses("primary")}`} href="/login?next=%2Fcli%2Fdevice">{t("Sign in to continue", "เข้าสู่ระบบเพื่อดำเนินการต่อ")}</a>
        )}

        {phase === "enter" && (
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void review(); }}>
            <label className="block text-sm text-fg" htmlFor="code">{t("Code shown in your terminal", "รหัสที่แสดงใน terminal")}</label>
            <input id="code" value={code} maxLength={9} inputMode="text" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX"
              onChange={(e) => setCode(clean(e.target.value))}
              onPaste={(e) => { e.preventDefault(); setCode(clean(e.clipboardData.getData("text"))); }}
              className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-lg tracking-widest" />
            <button type="submit" disabled={busy || code.replace("-", "").length !== 8} className={`mt-3 ${buttonClasses("primary")}`}>{t("Continue", "ต่อไป")}</button>
          </form>
        )}

        {phase === "review" && info && (
          <div className="mt-4 space-y-3 text-sm">
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              <dt className="text-subtle">{t("Device", "อุปกรณ์")}</dt>
              <dd className="text-fg">{info.clientName} <span className="text-xs text-subtle">({t("name reported by the device, unverified", "ชื่อที่อุปกรณ์แจ้งมา ยังไม่ได้ยืนยัน")})</span></dd>
              <dt className="text-subtle">{t("Requested", "เวลาที่ขอ")}</dt>
              <dd className="text-fg">{new Date(info.createdAt).toLocaleString(th ? "th-TH" : "en-GB")}</dd>
              <dt className="text-subtle">{t("From", "จาก")}</dt>
              <dd className="text-fg">{[info.ip ?? t("unknown IP", "ไม่ทราบ IP"), info.country].filter(Boolean).join(" · ")} <span className="text-xs text-subtle">({t("approximate", "โดยประมาณ")})</span></dd>
              <dt className="text-subtle">{t("Account", "บัญชี")}</dt>
              <dd className="text-fg">{info.account ? `@${info.account}` : "—"}</dd>
              <dt className="text-subtle">{t("Access", "สิทธิ์")}</dt>
              <dd className="text-fg">cli:setup {t("(create projects, read status)", "(สร้างโปรเจกต์ ดูสถานะ)")}</dd>
            </dl>
            <label className="flex items-start gap-2 text-fg">
              <input type="checkbox" checked={deploy} onChange={(e) => setDeploy(e.target.checked)} className="mt-1" />
              <span>{t("Also allow deploys (cli:deploy): import repos, start builds, read logs", "อนุญาตให้ deploy ด้วย (cli:deploy): นำเข้า repo, สั่ง build, ดู log")}</span>
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => decide(true)} className={buttonClasses("primary")}>{t("Approve", "อนุมัติ")}</button>
              <button type="button" disabled={busy} onClick={() => decide(false)} className={buttonClasses("secondary")}>{t("Deny", "ปฏิเสธ")}</button>
            </div>
          </div>
        )}

        {phase === "done" && <p role="status" className="mt-4 text-sm text-fg">{result}</p>}
        {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
      </Card>
    </main>
  );
}
