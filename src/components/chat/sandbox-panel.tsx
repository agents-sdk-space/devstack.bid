"use client";

import { Bot, Box, Check, Download, FileText, Globe, ImageIcon, LayoutTemplate, Library, Plug, Sparkles, Terminal, Users, X } from "lucide-react";
import type { ComponentType } from "react";
import { Badge, cn, Spinner } from "@/components/ui";
import type { Activity, ActivityKind } from "@/lib/chat/events";
import { useLang } from "../prefs";
import type { ChatFile, ChatImage, ChatInfo, ChatMode, Quota, SandboxStatus } from "./types";

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

function fmtBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function StatusDot({ status }: { status: SandboxStatus }) {
  const busy = status !== "idle" && status !== "sandbox_ready";
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden>
      {busy && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", status === "idle" ? "bg-subtle" : "bg-success")} />
    </span>
  );
}

export function SandboxPanel({
  info,
  status,
  activities,
  images,
  files,
  usage,
  remaining,
  byok,
  mode,
  className,
}: {
  info: ChatInfo | null;
  status: SandboxStatus;
  activities: Activity[];
  images: ChatImage[];
  files: ChatFile[];
  usage?: { input: number; output: number };
  remaining?: Quota;
  byok?: boolean;
  mode?: ChatMode;
  className?: string;
}) {
  const { t } = useLang();
  const envKind = info?.limits.environment ?? "openai_hosted";
  const hosted = envKind === "openai_hosted";
  const selfHosted = envKind === "self_hosted";
  const shown = activities.filter((a) => a.kind !== "reasoning").slice(-60);
  const caps: [ComponentType<{ className?: string }>, string][] = info?.template === "blank" ? [[Terminal, t("chat.cap.shell")]] : [
    [ImageIcon, t("chat.cap.image")],
    [Globe, t("chat.cap.search")],
    [Library, t("chat.cap.docs")],
    [Plug, t("chat.cap.mcp")],
    [LayoutTemplate, t("chat.cap.plan")],
    [Users, t("chat.cap.subagents")],
    ...(hosted || selfHosted ? ([[Terminal, t("chat.cap.files")]] as [ComponentType<{ className?: string }>, string][]) : []),
  ];

  return (
    <section aria-label={t("chat.sandbox")} className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface", className)}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Box className="h-4 w-4 text-subtle" aria-hidden />
        <h2 className="text-sm font-semibold">{t("chat.sandbox")}</h2>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
          <StatusDot status={status} />
          {t(`chat.status.${status}` as const)}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="rounded-xl border border-code-border bg-code-bg px-3 py-2.5 font-mono text-[11px] leading-relaxed text-code-muted">
          <p>
            <span className="text-code-prompt">$</span> env <span className="text-code-fg">{hosted ? "openai_hosted · small" : selfHosted ? "self_hosted · codex exec-server" : "none"}</span>
          </p>
          <p>
            <span className="text-code-prompt">$</span> model <span className="text-code-fg">{info?.limits.model ?? "gpt-6.1-sol"}</span>
          </p>
          <p className="mt-1 font-sans text-[11px] text-code-muted">{hosted ? t("chat.sandboxHosted") : selfHosted ? t("chat.sandboxSelf") : t("chat.sandboxNone")}</p>
        </div>

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("chat.activity")}</h3>
          {shown.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted">{mode && mode !== "agent" ? t("chat.sandboxAgentOnly") : status === "idle" ? t("chat.sandboxIdle") : t("chat.activityEmpty")}</p>
          ) : (
            <ol className="space-y-1.5" aria-live="polite">
              {shown.map((a) => {
                const Icon = KIND_ICON[a.kind] ?? Bot;
                return (
                  <li key={a.id} className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[12.5px] text-fg">
                        <span className="truncate">{a.label}</span>
                        {a.agent && (
                          <Badge size="sm" variant="info">
                            {a.agent}
                          </Badge>
                        )}
                      </p>
                      {a.detail && <p className="line-clamp-2 break-words font-mono text-[11px] text-muted">{a.detail}</p>}
                    </div>
                    <span className="mt-0.5 shrink-0">
                      {a.status === "running" ? (
                        <Spinner className="h-3.5 w-3.5 text-subtle" />
                      ) : a.status === "done" ? (
                        <Check className="h-3.5 w-3.5 text-success" aria-label="done" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-danger" aria-label="failed" />
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {(images.length > 0 || files.length > 0) && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("chat.outputs")}</h3>
            {images.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {images.map((im) => (
                  <a key={im.id} href={im.url} target="_blank" rel="noopener noreferrer" title={im.caption} className="focus-ring block overflow-hidden rounded-lg border border-border">
                    <img src={im.url} alt={im.caption} loading="lazy" className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <ul className="space-y-1">
              {files.map((f) => (
                <li key={f.id}>
                  <a href={f.url} className="focus-ring flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-surface-2" download>
                    <FileText className="h-3.5 w-3.5 text-subtle" aria-hidden />
                    <span className="truncate font-mono">{f.name}</span>
                    <span className="ml-auto text-[11px] text-subtle">{fmtBytes(f.size)}</span>
                    <Download className="h-3.5 w-3.5 text-subtle" aria-label={t("chat.download")} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t("chat.capabilities")}</h3>
          <ul className="grid gap-1.5">
            {caps.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-2 text-[12.5px] text-muted">
                <Icon className="h-3.5 w-3.5 text-subtle" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="space-y-1 border-t border-border px-4 py-2.5 text-[11px] text-subtle">
        {usage && (
          <p>
            {t("chat.usage")}: <span className="font-mono text-muted">{usage.input.toLocaleString()} in · {usage.output.toLocaleString()} out</span>
          </p>
        )}
        {info && !byok && (
          <p>
            {t("chat.quota")}:{" "}
            <span className="font-mono text-muted">
              {t("chat.agentLeft").replace("{n}", String(remaining?.agentLeft ?? info.quota?.agentLeft ?? info.limits.agentPerDay))}
            </span>
          </p>
        )}
        {byok && <p>{t("chat.byokQuota")}</p>}
      </footer>
    </section>
  );
}
