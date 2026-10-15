"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { fencedFiles } from "@/lib/auth/github-policy";
import { downloadDeployZip } from "@/lib/deploy/download-client";
import { buttonClasses } from "@/components/ui";

/** Chat result → deploy-ready zip of the fenced files (needs an index.html or src/index.js). */
export function DeployZipButton({ text, signedIn }: { text: string; signedIn: boolean }) {
  const files = fencedFiles(text).filter((f) => f.path);
  const deployable = files.some((f) => f.path === "index.html" || f.path === "src/index.js");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!signedIn || !deployable) return null;
  async function go() {
    setBusy(true); setErr("");
    try { await downloadDeployZip({ name: "chat-app", files: files.map((f) => ({ path: f.path, content: f.code })) }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => void go()} className={buttonClasses("secondary", "sm")}><Download className="h-3.5 w-3.5" aria-hidden />Download deploy zip</button>
      {err && <span role="alert" className="text-xs text-fg">{err}</span>}
    </span>
  );
}
