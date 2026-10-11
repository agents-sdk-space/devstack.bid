"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "./cn";
import { copyText } from "./copy";
import { useToastOptional } from "./toast";

export interface CodeBlockProps {
  code: string;
  /** File name or language shown in the header bar. */
  title?: string;
  /** Prefix each line with a shell prompt ($) — visual only, not copied. */
  prompt?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
  /** Toast title on copy; omit to skip the toast. */
  toastTitle?: string;
  className?: string;
  maxHeight?: string;
}

export function CodeBlock({
  code,
  title,
  prompt = false,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  toastTitle,
  className,
  maxHeight,
}: CodeBlockProps) {
  const toast = useToastOptional();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      if (toastTitle) toast({ title: toastTitle, variant: "success" });
    } else {
      toast({ title: "Clipboard unavailable", variant: "error" });
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-code-border bg-code-bg text-code-fg", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-code-border bg-white/[0.04] px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-code-muted">
          <span aria-hidden className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--nvx-chrome-close)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--nvx-chrome-min)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--nvx-chrome-zoom)]" />
          </span>
          <span className="truncate">{title ?? (prompt ? "shell" : "")}</span>
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="focus-ring motion-fast inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-code-muted hover:bg-white/10 hover:text-code-fg"
          aria-label={title ? `${copyLabel}: ${title}` : copyLabel}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>
      <pre className="overflow-auto p-3 font-mono text-[13px] leading-relaxed" style={maxHeight ? { maxHeight } : undefined} tabIndex={0}>
        <code>
          {prompt
            ? code.split("\n").map((line, i) => (
                <span key={i} className="block">
                  <span aria-hidden className="select-none text-code-prompt">
                    ${" "}
                  </span>
                  {line}
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
