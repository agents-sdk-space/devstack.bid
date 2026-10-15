"use client";

import { Activity, Code2, CreditCard, Database, FlaskConical, LayoutGrid, Palette, Rocket, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { PLUGIN_CATEGORY_LABELS } from "@/lib/i18n";
import { cn } from "@/components/ui";
import { useLang } from "@/components/prefs";

const ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  development: Code2,
  deployment: Rocket,
  database: Database,
  monitoring: Activity,
  testing: FlaskConical,
  payments: CreditCard,
  productivity: Zap,
  design: Palette,
  ai: Sparkles,
};

/**
 * Floating category dock for /plugins. Our own monochrome design, inspired by the
 * "floating dock" pattern (see docs/design/ui-ux-revamp-plan.md, design references).
 * Each item is a real toggle button with a visible label on hover/focus; the hover lift
 * is CSS-only and is disabled under prefers-reduced-motion.
 */
export function CategoryDock({ categories, value, onChange }: { categories: readonly string[]; value: string; onChange: (c: string) => void }) {
  const { lang, t } = useLang();
  const items = ["all", ...categories];
  return (
    <nav aria-label={t("plugins.dock")} className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <ul className="pointer-events-auto flex max-w-full items-end gap-1 overflow-x-auto rounded-2xl border border-border bg-bg/85 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-bg/70">
        {items.map((c) => {
          const Icon = ICONS[c] ?? LayoutGrid;
          const label = c === "all" ? t("plugins.all") : (PLUGIN_CATEGORY_LABELS[c]?.[lang] ?? c);
          const active = value === c;
          return (
            <li key={c} className="group relative">
              <button
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => onChange(c)}
                className={cn(
                  "focus-ring motion-fast grid h-10 w-10 place-items-center rounded-xl motion-safe:transition-transform motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:scale-110",
                  active ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:text-fg"
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              </button>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-0.5 text-xs text-fg group-focus-within:block group-hover:block"
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
