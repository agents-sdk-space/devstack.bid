"use client";

import type { ReactNode } from "react";
import type { ResolvedStep } from "@/lib/types";
import { CodeBlock } from "./copy-button";
import { useLang } from "./prefs";

const SOURCE_STYLE: Record<string, string> = {
  runtime: "border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300",
  template: "border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300",
  addon: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
  custom: "border-fuchsia-300 text-fuchsia-700 dark:border-fuchsia-700 dark:text-fuchsia-300",
};

export function StepCard({
  step,
  index,
  os = "posix",
  actions,
}: {
  step: ResolvedStep;
  index: number;
  os?: "posix" | "windows";
  actions?: ReactNode;
}) {
  const { lang, t } = useLang();
  const commands = os === "windows" ? step.windows : step.commands;
  const verify = os === "windows" ? step.verifyWindows : step.verify;

  return (
    <li className="card p-4 sm:p-5" aria-labelledby={`step-${step.id}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white dark:bg-indigo-500"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`step-${step.id}`} className="font-semibold leading-snug">
            <span className="sr-only">{index + 1}. </span>
            {step.title[lang]}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={`chip ${SOURCE_STYLE[step.source]}`}>{t(`source.${step.source}` as const)}</span>
            {step.kind !== "setup" && (
              <span className="chip border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                {t(`kind.${step.kind}` as const)}
              </span>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{step.explanation[lang]}</p>

      <div className="mt-3 space-y-3">
        {commands.length > 0 ? (
          <CodeBlock code={commands.join("\n")} />
        ) : (
          step.files.length === 0 && <p className="text-xs italic text-slate-500">{t("step.noCommands")}</p>
        )}

        {step.files.length > 0 && (
          <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-sm font-medium">
              {t("step.files")}: {step.files.map((f) => f.path).join(", ")}
            </summary>
            <div className="mt-3 space-y-3">
              {step.files.map((f) => (
                <div key={f.path}>
                  <p className="mb-1 font-mono text-xs text-slate-500">{f.path}</p>
                  <CodeBlock code={f.content} />
                </div>
              ))}
            </div>
          </details>
        )}

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
            <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{t("step.expected")}</dt>
            <dd className="mt-1">{step.expected[lang]}</dd>
          </div>
          {verify && (
            <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800/60">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{t("step.verify")}</dt>
              <dd className="mt-1 break-all font-mono text-xs">{verify}</dd>
            </div>
          )}
          {step.osNotes && (
            <div className="rounded-xl bg-amber-50 p-3 sm:col-span-2 dark:bg-amber-500/10">
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">{t("step.osNotes")}</dt>
              <dd className="mt-1">{step.osNotes[lang]}</dd>
            </div>
          )}
        </dl>
      </div>
    </li>
  );
}
