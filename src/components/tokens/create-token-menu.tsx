"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ExternalLink, KeyRound } from "lucide-react";
import { buttonClasses, cn } from "@/components/ui";
import { useLang } from "@/components/prefs";
import { TOKEN_PROVIDERS, type TokenProvider } from "@/lib/connections/token-providers";

/**
 * "Create token" button: opens a small menu of links to each provider's official token-creation page.
 * `primary` puts that provider first. Links open in a new tab with noopener/noreferrer. Monochrome,
 * keyboard operable (Enter/Space opens, Arrow keys move, Escape closes and returns focus).
 */
export function CreateTokenMenu({ primary, className }: { primary?: TokenProvider; className?: string }) {
  const { lang } = useLang();
  const th = lang === "th";
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = primary ? [...TOKEN_PROVIDERS].sort((a, b) => Number(b.id === primary) - Number(a.id === primary)) : [...TOKEN_PROVIDERS];

  useEffect(() => {
    if (!open) return;
    const first = root.current?.querySelector<HTMLAnchorElement>("[role=menuitem]");
    first?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>("[role=menuitem]") ?? [])];
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      links[(i + 1) % links.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      links[(i - 1 + links.length) % links.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={cn("relative inline-flex shrink-0", className)} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={buttonClasses("secondary", "sm")}
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        {th ? "สร้าง token" : "Create token"}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={th ? "สร้าง token ที่ผู้ให้บริการ" : "Create a token at the provider"} className="absolute right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg">
          {items.map((p) => (
            <a
              key={p.id}
              role="menuitem"
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="focus-ring flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-fg outline-none hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block", p.id === primary && "font-semibold")}>{p.name}</span>
                <span className="block truncate text-xs text-subtle">{th ? p.hint.th : p.hint.en}</span>
              </span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="sr-only">{th ? "(เปิดแท็บใหม่)" : "(opens in a new tab)"}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
