"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Blocks, Link2, Palette, Paperclip, Plus, type LucideIcon } from "lucide-react";
import { buttonClasses, cn } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";
import { useLang } from "../prefs";

/** Every entry opens a page that exists today. Add Skills here only when a Skills page exists. */
const LINKS: { href: string; label: DictKey; hint: DictKey; Icon: LucideIcon }[] = [
  { href: "/settings/connections", label: "chat.menu.connections", hint: "chat.menu.connectionsHint", Icon: Link2 },
  { href: "/design", label: "chat.menu.design", hint: "chat.menu.designHint", Icon: Palette },
  { href: "/plugins", label: "chat.menu.plugins", hint: "chat.menu.pluginsHint", Icon: Blocks },
];

const itemClass = "focus-ring flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-fg outline-none hover:bg-surface-2 focus-visible:bg-surface-2";

/**
 * "+" button in the chat composer. Opens a small menu: Attach a file (shown but off until storage and message
 * linking work end to end, so it explains why instead of doing nothing), then links to Connections, Design
 * system and Plugins. Keyboard: Enter/Space opens, Arrow keys/Home/End move, Escape closes and returns focus.
 */
export function ChatPlusMenu({ attachHint }: { /** Pass the explanation to show the Attach entry (off); omit to hide it. */ attachHint?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative shrink-0" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("chat.plus")}
        onClick={() => setOpen((v) => !v)}
        className={buttonClasses("ghost", "icon")}
      >
        <Plus className={cn("h-4 w-4 transition-transform", open && "rotate-45")} aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={t("chat.plusMenu")} className="absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-1 shadow-lg">
          {attachHint && (
            <button type="button" role="menuitem" aria-disabled="true" onClick={(e) => e.preventDefault()} className={cn(itemClass, "cursor-not-allowed opacity-60")}>
              <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block">{t("chat.attach")}</span>
                <span className="block text-xs text-subtle">{attachHint}</span>
              </span>
            </button>
          )}
          {LINKS.map(({ href, label, hint, Icon }) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block">{t(label)}</span>
                <span className="block text-xs text-subtle">{t(hint)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
