"use client";

import { useState } from "react";
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
    <div className={cn("overflow-hidden rounded-lg border border-code-border bg-code-bg text-code-fg", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-code-border bg-white/[0.03] px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-code-muted">
          <span aria-hidden className="flex gap-1">
            <span className="h-2 w-2 bg-code-muted/50" />
            <span className="h-2 w-2 bg-code-muted/50" />
            <span className="h-2 w-2 bg-code-prompt/80" />
          </span>
          <span className="truncate">{title ?? (prompt ? "shell" : "")}</span>
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="focus-ring motion-fast inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-code-muted hover:bg-white/10 hover:text-code-prompt"
          aria-label={title ? `${copyLabel}: ${title}` : copyLabel}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            {copied ? (
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m3.5 8.5 3 3 6-7" />
            ) : (
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                d="M5.5 5.5V3.75c0-.69.56-1.25 1.25-1.25h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25H10.5M3.75 5.5h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-5.5c-.69 0-1.25-.56-1.25-1.25v-5.5c0-.69.56-1.25 1.25-1.25Z"
              />
            )}
          </svg>
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
