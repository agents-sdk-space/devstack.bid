"use client";

import { useState } from "react";
import { Cloud, ExternalLink, Wrench } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { deployButtonUrl, type DeployProfile } from "@/lib/deploy/templates";

/**
 * Option C: "Deploy to Cloudflare" (Cloudflare clones + builds the repo with Workers Builds).
 * DevStack stores no Cloudflare token for this path. Needs a PUBLIC repo (Cloudflare limitation).
 */
export function DeployButtonPanel({ projectId, repo, repoPrivate, profile }: { projectId: string; repo: string; repoPrivate: boolean | null; profile: DeployProfile }) {
  const { lang } = useLang();
  const th = lang === "th";
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function prepare() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/prepare`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Failed");
      setMsg(b.alreadyPrepared ? (th ? "repo มีไฟล์ตั้งค่าครบแล้ว" : "Repo already has the Workers config.") : `PR #${b.pr.number}: ${b.pr.url}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center gap-2">
        <Cloud className="h-5 w-5" aria-hidden />
        <h2 className="text-base font-semibold text-fg">{th ? "Deploy ไป Cloudflare" : "Deploy to Cloudflare"}</h2>
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-subtle">{profile.target} · {profile.path}</span>
      </div>
      <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        <dt className="text-subtle">Build</dt><dd className="font-mono text-fg">{profile.build ?? "—"}</dd>
        <dt className="text-subtle">Entry</dt><dd className="font-mono text-fg">{profile.entry ?? "—"}</dd>
        <dt className="text-subtle">Assets</dt><dd className="font-mono text-fg">{profile.assetsDir ?? "—"}</dd>
        {profile.secrets.length > 0 && (<><dt className="text-subtle">Secrets</dt><dd className="font-mono text-fg">{profile.secrets.join(", ")}</dd></>)}
      </dl>
      {profile.flags.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-subtle">{profile.flags.map((f) => <li key={f}>{f}</li>)}</ul>
      )}
      {profile.path === "none" ? (
        <p className="mt-4 text-sm text-fg">{th ? "เทมเพลตนี้ deploy ขึ้น Cloudflare Workers ไม่ได้" : "This template can't be deployed to Cloudflare Workers."}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={prepare} disabled={busy} className={buttonClasses("secondary", "sm")}><Wrench className="h-4 w-4" aria-hidden />{th ? "เปิด PR ตั้งค่า Cloudflare" : "Open 'Prepare for Cloudflare' PR"}</button>
          {repoPrivate === false ? (
            <a href={deployButtonUrl(repo)} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "sm")}>
              {th ? "Deploy to Cloudflare" : "Deploy to Cloudflare"} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <p className="text-xs text-subtle">{th ? "ปุ่ม Deploy to Cloudflare ใช้ได้กับ repo สาธารณะเท่านั้น สำหรับ repo ส่วนตัว ให้ใช้ Deploy ตรงด้านล่าง หรือเชื่อม repo ใน Workers Builds ของ dashboard" : "The Deploy to Cloudflare button only works for public repos. For private repos use direct deploy below, or connect the repo in Workers Builds in your dashboard."}</p>
          )}
        </div>
      )}
      <p aria-live="polite" className="mt-2 break-all text-xs text-subtle">{msg}</p>
    </Card>
  );
}
