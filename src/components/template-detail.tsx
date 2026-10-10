"use client";

import Link from "next/link";
import { useState } from "react";
import { getTemplate } from "@/data/templates";
import { composeSteps, configForTemplate } from "@/lib/composer";
import { CATEGORY_LABELS } from "@/lib/i18n";
import { buildContext, resolveText } from "@/lib/placeholders";
import { Badge, buttonClasses, Card, CardContent, CardTitle } from "@/components/ui";
import { OsToggle } from "./os-toggle";
import { useLang } from "./prefs";
import { StepCard } from "./step-card";

export function TemplateDetail({ id }: { id: string }) {
  const { lang, t } = useLang();
  const [os, setOs] = useState<"posix" | "windows">("posix");
  const template = getTemplate(id)!;
  const config = configForTemplate(id);
  const steps = composeSteps(config);
  const ctx = buildContext(config, template);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-subtle">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/templates" className="focus-ring rounded text-primary hover:underline">
              {t("nav.templates")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="truncate text-muted">
            {template.name[lang]}
          </li>
        </ol>
      </nav>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="primary">{CATEGORY_LABELS[template.category][lang]}</Badge>
            {template.runtimes.map((r) => (
              <Badge key={r} variant="info">
                {r === "node" ? "Node.js" : "Python"}
              </Badge>
            ))}
          </div>
          <h1 className="term-prompt mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{template.name[lang]}</h1>
          <p className="mt-2 max-w-2xl text-muted">{template.summary[lang]}</p>
        </div>
        <Link href={`/builder#t=${template.id}`} className={buttonClasses("primary", "lg")}>
          {t("catalog.build")} →
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="steps-h">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="steps-h" className="text-xl font-semibold text-fg">
              {steps.length} {t("catalog.steps")}
            </h2>
            <OsToggle os={os} onChange={setOs} />
          </div>
          <p className="mb-4 text-xs text-subtle">{t("template.defaults")}</p>
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <StepCard key={s.id} step={s} index={i} os={os} />
            ))}
          </ol>
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <Card>
            <CardContent>
              <CardTitle as="h2">{t("template.fileTree")}</CardTitle>
              <pre className="mt-2 overflow-x-auto font-mono text-xs leading-6 text-muted">{template.fileTree.map((l) => resolveText(l, ctx)).join("\n")}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <CardTitle as="h2">{t("template.next")}</CardTitle>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg">
                {template.nextSteps.map((n) => (
                  <li key={n.en}>{n[lang]}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <CardTitle as="h2">{t("template.docs")}</CardTitle>
              <ul className="mt-2 space-y-1 text-sm">
                {template.docs.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noreferrer noopener" className="focus-ring rounded text-primary hover:underline">
                      {d.label} <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
