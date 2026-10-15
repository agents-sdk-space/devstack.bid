"use client";

import { Bot, Box, Check, ChevronDown, FileText, Globe, ImageIcon, LayoutTemplate, Plug, Sparkles, Terminal, Users, X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useId, useState } from "react";
import { cn, Spinner } from "@/components/ui";
import type { Activity, ActivityKind } from "@/lib/chat/events";
import { useLang } from "../prefs";

const KIND_ICON: Record<ActivityKind, ComponentType<{ className?: string }>> = {
  note: Sparkles,
  reasoning: Sparkles,
  tool: LayoutTemplate,
  search: Globe,
  mcp: Plug,
  command: Terminal,
  subagent: Users,
  sandbox: Box,
  image: ImageIcon,
  file: FileText,
};

export function ThoughtChain({
  activities,
  pending,
  className,
}: {
  activities: Activity[];
  /** Assistant message still streaming. */
  pending?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const panelId = useId();
  const shown = activities.filter((a) => a.kind !== "reasoning");
  const [open, setOpen] = useState(true);
  const running = shown.some((a) => a.status === "running");

  useEffect(() => {
    if (!pending && shown.length > 0 && !running) {
      const id = window.setTimeout(() => setOpen(false), 600);
      return () => window.clearTimeout(id);
    }
  }, [pending, running, shown.length]);

  if (shown.length === 0) return null;

  const doneCount = shown.filter((a) => a.status === "done").length;

  return (
    <div className={cn("rounded-xl border border-border bg-surface-2/40", className)}>
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={`${panelId}-panel`}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] text-fg"
      >
        <Box className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">
          {t("chat.thoughtChain")}
          <span className="ml-1.5 font-normal text-muted">
            · {shown.length} {t("chat.steps")}
            {!pending && doneCount === shown.length ? ` · ${t("chat.thoughtChainDone")}` : ""}
          </span>
        </span>
        {running && <Spinner variant="dots" className="h-4 w-4 shrink-0 text-subtle" aria-label={t("chat.thinking")} />}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-subtle motion-fast", open && "rotate-180")} aria-hidden />
      </button>
      <div
        id={`${panelId}-panel`}
        role="region"
        aria-labelledby={`${panelId}-trigger`}
        hidden={!open}
        className={cn(!open && "hidden")}
      >
        <ol className="space-y-0 border-t border-border px-2 py-2">
          {shown.map((a, i) => {
            const Icon = KIND_ICON[a.kind] ?? Bot;
            const last = i === shown.length - 1;
            return (
              <li key={a.id} className="relative flex gap-2.5 px-1 py-1.5">
                {!last && <span className="absolute bottom-0 left-[1.125rem] top-7 w-px bg-border" aria-hidden />}
                <span className="relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                  <Icon className="h-3.5 w-3.5 text-subtle" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pb-0.5">
                  <p className="text-[13px] font-medium text-fg">{a.label}</p>
                  {a.detail ? <p className="mt-0.5 line-clamp-2 break-words font-mono text-[11px] leading-snug text-muted">{a.detail}</p> : null}
                </div>
                <span className="mt-1 shrink-0">
                  {a.status === "running" ? (
                    <Spinner className="h-3.5 w-3.5 text-subtle" aria-label={t("chat.thinking")} />
                  ) : a.status === "done" ? (
                    <Check className="h-3.5 w-3.5 text-fg" aria-hidden />
                  ) : (
                    <X className="h-3.5 w-3.5 text-danger" aria-hidden />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
