"use client";

import { Fragment, useMemo } from "react";
import { CodeBlock } from "@/components/copy-button";
import { parseMarkdown, type Block, type Inline } from "@/lib/chat/markdown";

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.k) {
          case "text":
            return <Fragment key={i}>{n.v}</Fragment>;
          case "code":
            return (
              <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">
                {n.v}
              </code>
            );
          case "strong":
            return (
              <strong key={i} className="font-semibold text-fg">
                <InlineNodes nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineNodes nodes={n.c} />
              </em>
            );
          case "link": {
            const external = /^https?:/.test(n.href);
            return (
              <a key={i} href={n.href} className="link break-words" {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
                <InlineNodes nodes={n.c} />
              </a>
            );
          }
          case "img":
            return (
              <a key={i} href={n.src} target="_blank" rel="noopener" className="my-2 block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, same-origin generated image */}
                <img src={n.src} alt={n.alt} loading="lazy" className="max-h-[420px] max-w-full rounded-xl border border-border object-contain" />
              </a>
            );
        }
      })}
    </>
  );
}

function BlockNode({ b }: { b: Block }) {
  switch (b.k) {
    case "p":
      return (
        <p className="whitespace-pre-line">
          <InlineNodes nodes={b.c} />
        </p>
      );
    case "h": {
      const cls = b.level <= 2 ? "text-base font-semibold text-fg" : "text-sm font-semibold text-fg";
      return (
        <p role="heading" aria-level={b.level + 2} className={cls}>
          <InlineNodes nodes={b.c} />
        </p>
      );
    }
    case "code":
      return <CodeBlock code={b.v} title={b.lang || "text"} maxHeight="24rem" />;
    case "ul":
    case "ol": {
      const L = b.k;
      return (
        <L className={`${L === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-5 marker:text-subtle`}>
          {b.items.map((it, i) => (
            <li key={i}>
              <InlineNodes nodes={it} />
            </li>
          ))}
        </L>
      );
    }
    case "quote":
      return (
        <blockquote className="space-y-2 border-l-2 border-border-strong pl-3 text-muted">
          {b.c.map((c, i) => (
            <BlockNode key={i} b={c} />
          ))}
        </blockquote>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-surface-2">
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold">
                    <InlineNodes nodes={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      <InlineNodes nodes={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="border-border" />;
  }
}

/** Safe Markdown for agent replies (see src/lib/chat/markdown.ts for the rules). */
export function MarkdownView({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-fg">
      {blocks.map((b, i) => (
        <BlockNode key={i} b={b} />
      ))}
    </div>
  );
}
