"use client";

import type { ReactNode } from "react";
import type { ResolvedStep } from "@/lib/types";
import { Badge, type BadgeVariant, Card, cn } from "@/components/ui";
import { CodeBlock } from "./copy-button";
import { useLang } from "./prefs";

const SOURCE_VARIANT: Record<ResolvedStep["source"], BadgeVariant> = {
  runtime: "info",
  template: "primary",
  addon: "success",
  custom: "outline",
};

export function StepCard({
  step,
  index,
  os = "posix",
  actions,
  handle,
  className,
  as: Tag = "li",
  dragging = false,
  ...rest
}: {
  step: ResolvedStep;
  index: number;
  os?: "posix" | "windows";
  actions?: ReactNode;
  /** Optional drag handle rendered before the step number (builder only). */
  handle?: ReactNode;
  className?: string;
  as?: "li" | "div";
  dragging?: boolean;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLLIElement & HTMLDivElement>;
}) {
  const { lang, t } = useLang();
  const commands = os === "windows" ? step.windows : step.commands;
  const verify = os === "windows" ? step.verifyWindows : step.verify;

  return (
    <Tag aria-labelledby={`step-${step.id}`} className={cn("list-none", className)} {...rest}>
      <Card className={cn("p-4 sm:p-5", dragging && "shadow-lg ring-2 ring-primary")}>
        <div className="flex flex-wrap items-start gap-3">
          {handle}
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-fg">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={`step-${step.id}`} className="font-semibold leading-snug text-fg">
              <span className="sr-only">{index + 1}. </span>
              {step.title[lang]}
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant={SOURCE_VARIANT[step.source]}>{t(`source.${step.source}` as const)}</Badge>
              {step.kind !== "setup" && <Badge variant="warning">{t(`kind.${step.kind}` as const)}</Badge>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
        </div>

        <p className="mt-3 text-sm text-muted">{step.explanation[lang]}</p>

        <div className="mt-3 space-y-3">
          {commands.length > 0 ? (
            <CodeBlock code={commands.join("\n")} prompt title={os === "windows" ? "PowerShell" : "bash"} />
          ) : (
            step.files.length === 0 && <p className="text-xs italic text-subtle">{t("step.noCommands")}</p>
          )}

          {step.files.length > 0 && (
            <details className="group rounded-lg border border-border p-3">
              <summary className="focus-ring cursor-pointer rounded text-sm font-medium text-fg">
                {t("step.files")}: <span className="font-mono text-xs text-muted">{step.files.map((f) => f.path).join(", ")}</span>
              </summary>
              <div className="mt-3 space-y-3">
                {step.files.map((f) => (
                  <CodeBlock key={f.path} code={f.content} title={f.path} maxHeight="24rem" />
                ))}
              </div>
            </details>
          )}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-success-soft p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-success-fg">{t("step.expected")}</dt>
              <dd className="mt-1 text-fg">{step.expected[lang]}</dd>
            </div>
            {verify && (
              <div className="rounded-lg bg-surface-2 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t("step.verify")}</dt>
                <dd className="mt-1 break-all font-mono text-xs text-fg">{verify}</dd>
              </div>
            )}
            {step.osNotes && (
              <div className="rounded-lg bg-warning-soft p-3 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-warning-fg">{t("step.osNotes")}</dt>
                <dd className="mt-1 text-fg">{step.osNotes[lang]}</dd>
              </div>
            )}
          </dl>
        </div>
      </Card>
    </Tag>
  );
}
