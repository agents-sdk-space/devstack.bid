"use client";

import Link from "next/link";
import { useLang } from "@/components/prefs";
import { templateTool, ToolTile } from "@/components/brand/tool-icon";
import { TEMPLATES } from "@/data/templates";

/** Home shows at most three templates; the full catalogue lives on /templates. */
export const FEATURED = TEMPLATES.slice(0, 3);

export function FeaturedTemplates() {
  const { lang } = useLang();
  return (
    <ul className="mt-6 grid gap-3 sm:mt-8 md:grid-cols-3 md:gap-4">
      {FEATURED.map((t) => (
        <li key={t.id}>
          <Link href={`/templates/${t.id}`} className="focus-ring flex h-full gap-4 items-center rounded-xl border border-border bg-bg p-4 sm:items-start sm:p-5 transition-colors hover:border-border-strong">
            <ToolTile id={templateTool(t)} size="md" />
            <span className="min-w-0">
              <span className="block font-semibold text-fg">{t.name[lang]}</span>
              <span className="mt-1 line-clamp-2 hidden sm:block text-sm text-muted">{t.summary[lang]}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
