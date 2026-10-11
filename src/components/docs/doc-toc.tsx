"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui";
import { T } from "@/components/prefs";
import type { TocItem } from "@/lib/docs";

/** Right-hand "On this page" list (desktop) with scroll-spy. */
export function DocToc({ toc }: { toc: TocItem[] }) {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    const els = toc.map((h) => document.getElementById(h.id)).filter((x): x is HTMLElement => !!x);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [toc]);

  if (!toc.length) return null;
  return (
    <nav aria-labelledby="toc-heading" className="docs-ui sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8">
      <p id="toc-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
        <T k="docs.onThisPage" />
      </p>
      <ul className="space-y-0.5 border-l border-border">
        {toc.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={active === h.id ? "location" : undefined}
              className={cn(
                "focus-ring -ml-px block border-l-2 py-1 pr-2 text-[13px] leading-snug motion-fast",
                h.depth === 3 ? "pl-6" : "pl-3",
                active === h.id ? "border-link font-medium text-fg" : "border-transparent text-subtle hover:text-fg"
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Collapsible TOC above the article on narrower screens. */
export function MobileToc({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;
  return (
    <details className="docs-ui group mb-8 rounded-2xl border border-border bg-surface xl:hidden">
      <summary className="docs-state focus-ring flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-fg">
        <T k="docs.onThisPage" />
        <ChevronDown className="h-4 w-4 text-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="space-y-0.5 px-2 pb-3">
        {toc.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={cn("docs-state focus-ring block rounded-full py-1.5 pr-3 text-[13px] text-muted", h.depth === 3 ? "pl-7" : "pl-3")}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
