"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PLUGIN_CATEGORY_LABELS } from "@/lib/i18n";
import type { Plugin } from "@/lib/plugins/catalog";
import { repoSlug } from "@/lib/plugins/catalog";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { useLang } from "@/components/prefs";

export function PluginCard({ plugin }: { plugin: Plugin }) {
  const { lang, t } = useLang();
  return (
    <Card as="article" interactive className="relative flex w-full min-w-0 flex-col p-6">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline">{PLUGIN_CATEGORY_LABELS[plugin.category]?.[lang] ?? plugin.category}</Badge>
        <span className="truncate font-mono text-xs text-subtle">{repoSlug(plugin.source)}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-fg">
        <Link href={`/plugins/${plugin.name}`} className="focus-ring rounded hover:text-link">
          {plugin.name}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm text-muted">{plugin.description}</p>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
        <Link href={`/plugins/${plugin.name}`} className={buttonClasses("secondary", "sm")}>
          {t("plugins.details")}
        </Link>
        <a href={plugin.source} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "sm")}>
          {t("plugins.source")} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </Card>
  );
}
