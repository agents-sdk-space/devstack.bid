"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppWindow, Blocks, BookOpen, Bot, House, Languages, Layers, LayoutGrid, Menu, FlaskConical, MessagesSquare, Moon, Palette, SquareTerminal, Sun } from "lucide-react";
import { Button, buttonClasses, cn, Dialog, DialogContent, DialogTrigger, SearchIcon, Tooltip } from "@/components/ui";
import { AccountButton } from "./account-button";
import { SetupCursor } from "./setup-cursor";
import { CommandPalette, PaletteTrigger } from "./command-palette";
import { Mascot } from "./brand/mascot";
import { TerminalSignature } from "./brand/terminal-signature";
import type { DictKey } from "@/lib/i18n";
import { useDarkMode, useLang } from "./prefs";
import { CookiePreferences } from "./cookie-preferences";

const NAV = [
  { href: "/", key: "nav.home", Icon: House },
  { href: "/templates", key: "nav.templates", Icon: LayoutGrid },
  { href: "/builder", key: "nav.builder", Icon: Blocks },
  { href: "/chat", key: "nav.chat", Icon: MessagesSquare },
  { href: "/chat/dev", key: "nav.devChat", Icon: SquareTerminal, wide: true },
  { href: "/factory", key: "nav.factory", Icon: FlaskConical, wide: true },
  { href: "/docs/platform", key: "nav.functions", Icon: Layers },
  { href: "/docs/agents/cursor-caretakers", key: "nav.agents", Icon: Bot, wide: true },
  // /studio is a separate, cross-origin-isolated document (static Vite app, COOP/COEP): a plain
  // <a> forces the full page load that applies those headers (a client-side Link would not).
  { href: "/studio/", key: "nav.studio", Icon: AppWindow, wide: true, document: true },
  { href: "/docs", key: "nav.docs", Icon: BookOpen },
  { href: "/design", key: "nav.design", Icon: Palette, wide: true },
] as const;

/** Next <Link> for app routes; a plain <a> for documents outside the Next.js router (/studio). */
function NavLink({
  item,
  children,
  ...props
}: { item: (typeof NAV)[number]; children: React.ReactNode } & Omit<React.ComponentProps<"a">, "href" | "children">) {
  if ("document" in item && item.document) {
    return (
      <a href={item.href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={item.href} {...props}>
      {children}
    </Link>
  );
}

/** The four links in the bar (nextjs.org-style restraint). Everything else lives in the menu sheet. */
const PRIMARY: { href: string; key: "nav.templates" | "nav.builderShort" | "nav.chat" | "nav.docs" }[] = [
  { href: "/templates", key: "nav.templates" },
  { href: "/builder", key: "nav.builderShort" },
  { href: "/chat", key: "nav.chat" },
  { href: "/docs", key: "nav.docs" },
];

function isActive(pathname: string, href: string) {
  if (href === "/" || href === "/chat") return pathname === href;
  if (href === "/docs") return pathname === "/docs" || (pathname.startsWith("/docs/") && !pathname.startsWith("/docs/platform") && !pathname.startsWith("/docs/agents/cursor-caretakers"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const { t, lang, setLang } = useLang();
  const { dark, toggle } = useDarkMode();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <header className="nav-glass sticky top-0 z-30 border-b border-border">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
      >
        {t("skip")}
      </a>
      <div className="mx-auto flex h-14 max-w-content items-center gap-2 px-4 sm:gap-3 sm:px-5">
        <Link href="/" className="focus-ring flex items-center gap-2 rounded-md font-semibold tracking-tight" aria-label="NVX Stack Builder home">
          <Mascot size={28} />
          <span className="hidden text-[15px] sm:inline">Stack Builder</span>
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("focus-ring motion-fast whitespace-nowrap rounded-md px-3 py-1.5 text-sm", active ? "font-medium text-fg" : "text-muted hover:text-fg")}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <PaletteTrigger onClick={() => setPaletteOpen(true)} />
          <AccountButton next={pathname} />
          <span className="hidden sm:contents">
            <Link href="/builder" className={buttonClasses("primary", "sm")}>
              {t("nav.start")}
            </Link>
          </span>
          <Tooltip content={t("palette.open")}>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("palette.open")} onClick={() => setPaletteOpen(true)}>
              <SearchIcon className="text-base" />
            </Button>
          </Tooltip>
          <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={() => setLang(lang === "en" ? "th" : "en")} aria-label={t("toggle.langLabel")}>
            <Languages className="h-4 w-4" aria-hidden />
            <span className="sr-only">{t("toggle.lang")}</span>
          </Button>
          <Tooltip content={t("toggle.theme")}>
            <Button variant="ghost" size="icon" className="max-sm:hidden" onClick={toggle} aria-label={t("toggle.theme")} aria-pressed={dark}>
              {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </Button>
          </Tooltip>
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("nav.menu")}>
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent side="right" title={t("nav.mainMenu")} closeLabel={t("nav.close")}>
              <div className="mb-4 space-y-2">
                <AccountButton next={pathname} full onNavigate={() => setMenuOpen(false)} />
                <SetupCursor appearance="menu" />
                <div className="flex gap-2 sm:hidden">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setLang(lang === "en" ? "th" : "en")} aria-label={t("toggle.langLabel")}>
                    <Languages className="h-4 w-4" aria-hidden /> {t("toggle.lang")}
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={toggle} aria-label={t("toggle.theme")} aria-pressed={dark}>
                    {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />} {t("toggle.theme")}
                  </Button>
                </div>
              </div>
              <nav aria-label="Mobile">
                <ul className="space-y-1">
                  {NAV.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <NavLink
                          item={item}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "focus-ring motion-fast flex items-center gap-3 rounded-md px-3 py-3 text-base",
                            active ? "bg-surface-2 font-semibold text-fg" : "text-fg hover:bg-surface-2"
                          )}
                        >
                          <item.Icon className="h-5 w-5 text-subtle" aria-hidden />
                          {t(item.key)}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="mt-6 space-y-2 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false);
                    setPaletteOpen(true);
                  }}
                >
                  <SearchIcon /> {t("palette.open")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}

const FOOTER: { heading: "footer.product" | "footer.resources" | "footer.developers"; links: { href: string; key: DictKey; document?: boolean }[] }[] = [
  {
    heading: "footer.product",
    links: [
      { href: "/templates", key: "nav.templates" },
      { href: "/builder", key: "nav.builderShort" },
      { href: "/chat", key: "nav.chat" },
      { href: "/studio/", key: "nav.studio", document: true },
    ],
  },
  {
    heading: "footer.resources",
    links: [
      { href: "/docs", key: "nav.docs" },
      { href: "/learn", key: "nav.learn" },
      { href: "/plugins", key: "nav.plugins" },
      { href: "/design", key: "nav.design" },
    ],
  },
  {
    heading: "footer.developers",
    links: [
      { href: "/docs/platform", key: "nav.functions" },
      { href: "/openapi.json", key: "nav.openapi" },
      { href: "/llms.txt", key: "docs.forAgents" },
      { href: "/settings/mcp", key: "nav.mcpSettings" },
      { href: "/chat/dev", key: "nav.devChat" },
      { href: "/factory", key: "nav.factory" },
      { href: "/docs/agents/cursor-caretakers", key: "nav.agents" },
    ],
  },
];

const LEGAL: { href: string; key: DictKey }[] = [
  { href: "/about", key: "nav.about" },
  { href: "/contact", key: "nav.contact" },
  { href: "/support", key: "footer.support" },
  { href: "/status", key: "footer.status" },
  { href: "/careers", key: "footer.careers" },
  { href: "/terms", key: "footer.terms" },
  { href: "/security", key: "footer.security" },
  { href: "/privacy", key: "footer.privacy" },
];

/** App-style pages (/chat, /chat/dev) fill the viewport, so they have no footer. */
export function hidesFooter(pathname: string | null): boolean {
  return !!pathname && (pathname === "/chat" || pathname.startsWith("/chat/"));
}

export function Footer() {
  const { t } = useLang();
  const pathname = usePathname();
  if (hidesFooter(pathname)) return null;
  return (
    <footer className="mt-section-sm border-t border-border bg-bg text-sm sm:mt-section">
      <div className="mx-auto grid max-w-content gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.2fr_repeat(3,1fr)]">
        {/* DevStack signature: on every page, beside the link columns. */}
        <div className="flex flex-col items-start gap-3">
          <TerminalSignature className="w-44" />
          <p className="font-mono text-caption text-muted">
            DevStack · <a href="https://devstack.bid" className="link">devstack.bid</a>
          </p>
        </div>
        {FOOTER.map((col) => (
          <nav key={col.heading} aria-label={t(col.heading)}>
            <h2 className="text-sm font-medium text-fg">{t(col.heading)}</h2>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.href}>
                  {l.document ? (
                    <a href={l.href} className="focus-ring rounded-sm text-muted hover:text-fg">{t(l.key)}</a>
                  ) : (
                    <Link href={l.href} className="focus-ring rounded-sm text-muted hover:text-fg">{t(l.key)}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-content flex-col gap-4 px-5 py-6 text-caption text-muted lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label={t("footer.legal")}>
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {LEGAL.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="focus-ring rounded-sm hover:text-fg">{t(l.key)}</Link>
                </li>
              ))}
              <li>
                <CookiePreferences />
              </li>
            </ul>
          </nav>
          <p>{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
