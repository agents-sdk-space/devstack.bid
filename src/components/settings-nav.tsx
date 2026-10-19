"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import type { DictKey } from "@/lib/i18n";
import { useLang } from "./prefs";

const ITEMS: { href: string; key: DictKey; exact?: boolean }[] = [
  { href: "/settings", key: "settings.nav.general", exact: true },
  { href: "/settings/mcp", key: "settings.nav.mcp" },
  { href: "/settings/connections", key: "settings.nav.connections" },
  { href: "/settings/environment", key: "settings.nav.environment" },
  { href: "/settings/cli", key: "settings.nav.cli" },
  { href: "/projects", key: "settings.nav.projects" },
];

/** Settings section tabs (monochrome underline, nextjs.org-like). */
export function SettingsNav() {
  const path = usePathname() ?? "";
  const { t } = useLang();
  return (
    <nav aria-label={t("settings.title")} className="mx-auto flex w-full max-w-4xl gap-4 overflow-x-auto border-b border-border px-4 pt-6 text-sm">
      {ITEMS.map((i) => {
        const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
        return (
          <a
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg",
              active ? "border-fg text-fg" : "border-transparent text-subtle hover:text-fg"
            )}
          >
            {t(i.key)}
          </a>
        );
      })}
    </nav>
  );
}
