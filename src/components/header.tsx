"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDarkMode, useLang } from "./prefs";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/templates", key: "nav.templates" },
  { href: "/builder", key: "nav.builder" },
] as const;

export function Header() {
  const { t, lang, setLang } = useLang();
  const { dark, toggle } = useDarkMode();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/80">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-white">
        {t("skip")}
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="NVX Stack Builder home">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 text-sm font-black text-white">
            NVX
          </span>
          <span className="hidden sm:inline">NVX Stack Builder</span>
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:ml-6 sm:w-auto">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5"
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            aria-label={t("toggle.langLabel")}
          >
            <span aria-hidden>🌐</span> {t("toggle.lang")}
          </button>
          <button type="button" className="btn-secondary px-3 py-1.5" onClick={toggle} aria-label={t("toggle.theme")} aria-pressed={dark}>
            <span aria-hidden>{dark ? "☀️" : "🌙"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="mt-16 border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <p className="mx-auto max-w-3xl px-4">{t("footer.text")}</p>
    </footer>
  );
}
