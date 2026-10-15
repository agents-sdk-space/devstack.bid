"use client";

import { useState } from "react";
import { PLUGIN_CATEGORY_LABELS } from "@/lib/i18n";
import { PLUGIN_CATEGORIES, PLUGIN_SOURCE, PLUGINS } from "@/lib/plugins/catalog";
import { cn } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { CategoryDock } from "./category-dock";
import { PluginCard } from "./plugin-card";

export function PluginCatalog() {
  const { lang, t } = useLang();
  const [category, setCategory] = useState("all");
  const filtered = category === "all" ? PLUGINS : PLUGINS.filter((p) => p.category === category);
  return (
    <div className="pb-24">
      <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
        {["all", ...PLUGIN_CATEGORIES].map((c) => (
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
            {c === "all" ? t("plugins.all") : (PLUGIN_CATEGORY_LABELS[c]?.[lang] ?? c)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-subtle" aria-live="polite">
        {filtered.length} {t("plugins.count")}
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <li key={p.name} className="flex min-w-0">
            <PluginCard plugin={p} />
          </li>
        ))}
      </ul>
      <p className="mt-10 text-xs text-subtle">
        {t("plugins.disclaimer")} {t("plugins.catalogFrom")}{" "}
        <a href={PLUGIN_SOURCE.url} target="_blank" rel="noopener noreferrer" className="focus-ring break-all rounded underline hover:text-fg">
          {PLUGIN_SOURCE.repo}@{PLUGIN_SOURCE.commit.slice(0, 7)}
        </a>{" "}
        ({PLUGIN_SOURCE.license})
      </p>
      <CategoryDock categories={PLUGIN_CATEGORIES} value={category} onChange={setCategory} />
    </div>
  );
}
