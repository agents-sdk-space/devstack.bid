"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PLUGIN_CATEGORY_LABELS } from "@/lib/i18n";
import { getPlugin, repoSlug } from "@/lib/plugins/catalog";
import { Badge, buttonClasses } from "@/components/ui";
import { useLang } from "@/components/prefs";

export function PluginDetail({ name }: { name: string }) {
  const { lang, t } = useLang();
  const plugin = getPlugin(name);
  if (!plugin) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/plugins" className="focus-ring rounded text-sm text-muted hover:text-fg">
        {t("plugins.back")}
      </Link>
      <div className="mt-6 flex items-center gap-2">
        <Badge variant="outline">{PLUGIN_CATEGORY_LABELS[plugin.category]?.[lang] ?? plugin.category}</Badge>
        <span className="break-all font-mono text-xs text-subtle">{repoSlug(plugin.source)}</span>
      </div>
      <h1 className="mt-3 text-4xl font-bold tracking-tighter text-fg">{plugin.name}</h1>
      <p className="mt-3 text-lg text-muted">{plugin.description}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary")}>
          {t("plugins.homepage")} <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
        <a href={plugin.source} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
          {t("plugins.source")} <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <h2 className="mt-10 text-sm font-semibold text-fg">{t("plugins.keywords")}</h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {plugin.keywords.map((k) => (
          <li key={k}>
            <Badge size="sm">{k}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-10 border-t border-border pt-6 text-xs text-subtle">{t("plugins.disclaimer")}</p>
    </div>
  );
}
