"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  { href: "/settings/mcp", label: "MCP" },
  { href: "/settings/connections", label: "Connections" },
  { href: "/projects", label: "Projects" },
];

/** Settings section tabs (monochrome underline, nextjs.org-like). */
export function SettingsNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Settings" className="mx-auto flex w-full max-w-4xl gap-4 border-b border-border px-4 pt-6 text-sm">
      {ITEMS.map((i) => {
        const active = path === i.href || path.startsWith(`${i.href}/`);
        return (
          <a key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 pb-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg", active ? "border-fg text-fg" : "border-transparent text-subtle hover:text-fg")}>
            {i.label}
          </a>
        );
      })}
    </nav>
  );
}
