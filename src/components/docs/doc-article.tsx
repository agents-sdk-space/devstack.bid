"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText, useToastOptional } from "@/components/ui";
import { useLang } from "@/components/prefs";

/**
 * Renders the build-time, sanitized HTML of a doc (scripts/build-docs.mjs) and wires it up with
 * event delegation: copy buttons on code blocks, client-side navigation for /docs links.
 */
export function DocArticle({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToastOptional();
  const { t } = useLang();

  // Localise the static "Copy" labels baked into the HTML.
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLButtonElement>("[data-copy-code]").forEach((b) => {
      if (!b.dataset.copied) b.textContent = t("docs.copyCode");
      b.setAttribute("aria-label", `${t("docs.copyCode")} (${b.closest<HTMLElement>(".docs-code")?.dataset.lang ?? "code"})`);
    });
  }, [t, html]);

  async function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>("[data-copy-code]");
    if (btn) {
      const code = btn.closest(".docs-code")?.querySelector("pre")?.textContent ?? "";
      const ok = await copyText(code.replace(/\n$/, ""));
      if (ok) {
        btn.dataset.copied = "true";
        btn.textContent = t("docs.copiedCode");
        setTimeout(() => {
          delete btn.dataset.copied;
          btn.textContent = t("docs.copyCode");
        }, 1500);
      }
      toast?.(ok ? { title: t("toast.copied"), variant: "success" } : { title: t("toast.copyFailed"), variant: "error" });
      return;
    }
    const a = target.closest<HTMLAnchorElement>("a[href]");
    const href = a?.getAttribute("href");
    if (a && href && href.startsWith("/docs") && !href.endsWith(".md") && !a.target && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      router.push(href);
    }
  }

  return (
    // Click delegation only: the targets are real <button>/<a> elements with their own keyboard support.
    <div ref={ref} className="docs-prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** Copies the page's exact Markdown source (the same bytes as /docs/<slug>.md). */
export function CopyMarkdownButton({ raw, className }: { raw: string; className?: string }) {
  const { t } = useLang();
  const toast = useToastOptional();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      data-testid="copy-markdown"
      onClick={async () => {
        const ok = await copyText(raw);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
        toast?.(ok ? { title: t("docs.copiedMd"), variant: "success" } : { title: t("toast.copyFailed"), variant: "error" });
      }}
    >
      {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4 text-subtle" aria-hidden />}
      {copied ? t("docs.copiedMd") : t("docs.copyMd")}
    </button>
  );
}
