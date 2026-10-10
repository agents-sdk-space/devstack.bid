"use client";

import { useLang } from "./prefs";

export function OsToggle({ os, onChange }: { os: "posix" | "windows"; onChange: (os: "posix" | "windows") => void }) {
  const { t } = useLang();
  return (
    <div role="group" aria-label={t("builder.os")} className="inline-flex rounded-xl border border-slate-300 p-0.5 text-sm dark:border-slate-700">
      {(
        [
          ["posix", "macOS / Linux"],
          ["windows", "Windows PowerShell"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={os === value}
          onClick={() => onChange(value)}
          className={`rounded-lg px-3 py-1 transition ${os === value ? "bg-indigo-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
