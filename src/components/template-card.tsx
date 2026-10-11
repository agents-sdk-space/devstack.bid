"use client";

import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/i18n";
import type { StackTemplate } from "@/lib/types";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { tagTool, templateTool, ToolIcon, ToolTile } from "./brand/tool-icon";
import { useLang } from "./prefs";

export function TemplateCard({ template }: { template: StackTemplate }) {
  const { lang, t } = useLang();
  return (
    <Card as="article" interactive className="relative flex flex-col p-6">
      <div className="flex items-center gap-3">
        <ToolTile id={templateTool(template)} size="md" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <Badge variant="primary">{CATEGORY_LABELS[template.category][lang]}</Badge>
          <span className="text-xs text-subtle">{template.runtimes.map((r) => (r === "node" ? "Node.js" : "Python")).join(" + ")}</span>
        </div>
      </div>
      <h3 className="mt-4 text-lg font-semibold leading-snug tracking-tight text-fg">
        <Link href={`/templates/${template.id}`} className="focus-ring rounded hover:text-link">
          {template.name[lang]}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm text-muted">{template.summary[lang]}</p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
        {template.tags.map((tag) => {
          const tool = tagTool(tag);
          return (
            <li key={tag}>
              <Badge size="sm">
                {tool && <ToolIcon id={tool} className="text-[12px]" />}
                {tag}
              </Badge>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
        <Link href={`/templates/${template.id}`} className={buttonClasses("secondary", "sm")}>
          {t("catalog.open")} · {template.steps.length} {t("catalog.steps")}
        </Link>
        <Link href={`/builder#t=${template.id}`} className={buttonClasses("primary", "sm")}>
          {t("catalog.build")} →
        </Link>
      </div>
    </Card>
  );
}
