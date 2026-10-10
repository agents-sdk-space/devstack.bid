"use client";

import { useMemo, useState } from "react";
import { TEMPLATES } from "@/data/templates";
import { CATEGORY_LABELS } from "@/lib/i18n";
import { Button, cn, EmptyState, Input, SearchIcon } from "@/components/ui";
import { useLang } from "./prefs";
import { TemplateCard } from "./template-card";
import { SearchX } from "lucide-react";

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label htmlFor="search" className="sr-only">
          {t("catalog.search")}
        </label>
        <div className="relative lg:w-96">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <Input id="search" type="search" className="pl-9" placeholder={t("catalog.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "focus-ring motion-fast rounded-full border px-3.5 py-1 text-sm",
                category === c ? "border-transparent bg-fg text-bg" : "border-border text-muted hover:border-border-strong hover:text-fg"
              )}
            >
              {c === "all" ? t("catalog.all") : CATEGORY_LABELS[c][lang]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-subtle" aria-live="polite">
        {filtered.length} {t("catalog.count")}
      </p>
      {filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<SearchX className="h-6 w-6" strokeWidth={1.75} />}
          title={t("catalog.none")}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              {t("catalog.clear")}
            </Button>
          }
        />
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} />
          ))}
        </div>
      )}
    </div>
  );
}
