"use client";

import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/i18n";
import type { StackTemplate } from "@/lib/types";
import { useLang } from "./prefs";

export function TemplateCard({ template }: { template: StackTemplate }) {
  const { lang, t } = useLang();
  return (
    <article className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="chip">{CATEGORY_LABELS[template.category][lang]}</span>
        <span className="text-xs text-slate-500">
          {template.runtimes.map((r) => (r === "node" ? "Node.js" : "Python")).join(" + ")}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug">
        <Link href={`/templates/${template.id}`} className="hover:underline">
          {template.name[lang]}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">{template.summary[lang]}</p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
        {template.tags.map((tag) => (
          <li key={tag} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {tag}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/templates/${template.id}`} className="btn-secondary px-3 py-1.5">
          {t("catalog.open")} · {template.steps.length} {t("catalog.steps")}
        </Link>
        <Link href={`/builder#t=${template.id}`} className="btn-primary px-3 py-1.5">
          {t("catalog.build")}
        </Link>
      </div>
    </article>
  );
}
