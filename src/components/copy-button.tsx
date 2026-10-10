"use client";

import { useState } from "react";
import { useLang } from "./prefs";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn-ghost text-xs ${className}`}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      aria-label={label ?? t("step.copy")}
    >
      <span aria-live="polite">{done ? `✓ ${t("step.copied")}` : `📋 ${label ?? t("step.copy")}`}</span>
    </button>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="group relative">
      <pre className="code pr-24">
        <code>{code}</code>
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} label={label} className="bg-slate-800/80 text-slate-100 hover:bg-slate-700" />
      </div>
    </div>
  );
}
