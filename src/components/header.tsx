"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Blocks, BookOpen, House, Languages, LayoutGrid, Menu, Moon, Palette, Sun } from "lucide-react";
import { Button, cn, Dialog, DialogContent, DialogTrigger, SearchIcon, Tooltip } from "@/components/ui";
import { CommandPalette, PaletteTrigger } from "./command-palette";
import { Mascot } from "./brand/mascot";
import { TerminalSignature } from "./brand/terminal-signature";
import { useDarkMode, useLang } from "./prefs";

const NAV = [
  { href: "/", key: "nav.home", Icon: House },
  { href: "/templates", key: "nav.templates", Icon: LayoutGrid },
  { href: "/builder", key: "nav.builder", Icon: Blocks },
  { href: "/docs", key: "nav.docs", Icon: BookOpen },
  { href: "/design", key: "nav.design", Icon: Palette },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
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
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="focus-ring flex items-center gap-2 rounded-md font-semibold tracking-tight" aria-label="NVX Stack Builder home">
          <Mascot size={28} />
          <span className="hidden text-[15px] sm:inline">Stack Builder</span>
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring motion-fast whitespace-nowrap rounded-md px-3 py-1.5 text-[13px]",
                  active ? "font-medium text-fg" : "text-subtle hover:text-fg"
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <PaletteTrigger onClick={() => setPaletteOpen(true)} />
          <Tooltip content={t("palette.open")}>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("palette.open")} onClick={() => setPaletteOpen(true)}>
              <SearchIcon className="text-base" />
            </Button>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === "en" ? "th" : "en")} aria-label={t("toggle.langLabel")}>
            <Languages className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("toggle.lang")}</span>
          </Button>
          <Tooltip content={t("toggle.theme")}>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("toggle.theme")} aria-pressed={dark}>
              {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </Button>
          </Tooltip>
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.menu")}>
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent side="right" title={t("nav.mainMenu")} closeLabel={t("nav.close")}>
              <nav aria-label="Mobile">
                <ul className="space-y-1">
                  {NAV.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "focus-ring motion-fast flex items-center gap-3 rounded-md px-3 py-3 text-base",
                            active ? "bg-surface-2 font-semibold text-fg" : "text-fg hover:bg-surface-2"
                          )}
                        >
                          <item.Icon className="h-5 w-5 text-subtle" aria-hidden />
                          {t(item.key)}
                        </Link>
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

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="mt-20 border-t border-border bg-surface py-10 text-center text-xs leading-relaxed text-subtle">
      {/* DevStack signature: on every page, above the existing footer line. */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col items-center gap-3 px-4">
        <TerminalSignature className="w-52 sm:w-60" />
        <p className="font-mono text-[11px] tracking-wide text-muted">
          DevStack · <a href="https://devstack.bid" className="link">devstack.bid</a>
        </p>
      </div>
      <p className="mx-auto max-w-3xl px-4">{t("footer.text")}</p>
    </footer>
  );
}
