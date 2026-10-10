"use client";

import { useMemo, useState } from "react";
import { TEMPLATES } from "@/data/templates";
import { CATEGORY_LABELS } from "@/lib/i18n";
import { useLang } from "./prefs";
import { TemplateCard } from "./template-card";

export function Catalog() {
  const { lang, t } = useLang();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => ["all", ...new Set(TEMPLATES.map((tpl) => tpl.category))], []);

  const filtered = TEMPLATES.filter((tpl) => {
    if (category !== "all" && tpl.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [tpl.name.en, tpl.name.th, tpl.summary.en, tpl.summary.th, ...tpl.tags, ...tpl.keywords].join(" ").toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="search" className="sr-only">
          {t("catalog.search")}
        </label>
        <input
          id="search"
          type="search"
          className="input sm:max-w-md"
          placeholder={t("catalog.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                category === c
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {c === "all" ? t("catalog.all") : CATEGORY_LABELS[c][lang]}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {filtered.length} templates
      </p>
      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-slate-500">{t("catalog.none")}</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} />
          ))}
        </div>
      )}
    </div>
  );
}
