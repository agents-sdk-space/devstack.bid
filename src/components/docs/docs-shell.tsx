"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Menu, Search, X } from "lucide-react";
import { cn, Dialog, DialogContent, Kbd } from "@/components/ui";
import { L, useLang } from "@/components/prefs";
import { searchDocs, type SearchEntry } from "@/lib/docs-search";
import type { DocsNav } from "@/lib/docs";

const pagePath = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

/**
 * Docs chrome in Material 3 terms: a standard navigation drawer on desktop (left column), a modal
 * navigation drawer on mobile opened from a small top app bar, and a search bar at the top of the
 * drawer. Only /docs uses this; the rest of the site keeps its own layout.
 */
export function DocsShell({ nav, fontClass = "", children }: { nav: DocsNav; fontClass?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const current = nav.sections.flatMap((s) => s.pages).find((p) => pagePath(p.slug) === pathname);

  // "/" focuses the docs search (desktop drawer, or opens the mobile drawer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      const input = document.getElementById("docs-search-desktop") as HTMLInputElement | null;
      if (input && input.offsetParent !== null) input.focus();
      else {
        setFocusSearch(true);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[90rem] lg:grid lg:grid-cols-[18.5rem_minmax(0,1fr)]">
      {/* Mobile top app bar */}
      <div className="docs-ui nav-glass sticky top-14 z-20 flex h-12 items-center gap-1 border-b border-border px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="docs-state focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg"
          aria-label={t("docs.menu")}
          data-testid="docs-menu"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{current?.navTitle ?? t("docs.title")}</span>
        <button
          type="button"
          onClick={() => {
            setFocusSearch(true);
            setOpen(true);
          }}
          className="docs-state focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg"
          aria-label={t("docs.search")}
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Standard navigation drawer (desktop) */}
      <aside className="docs-ui sticky top-14 hidden h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-border px-3 pb-10 pt-6 lg:block">
        <DocsNavPanel nav={nav} pathname={pathname} inputId="docs-search-desktop" />
      </aside>

      {/* Modal navigation drawer (mobile) */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setFocusSearch(false);
        }}
      >
        <DialogContent side="left" title={t("docs.nav")} closeLabel={t("nav.close")} className={cn("docs-ui docs-root bg-surface", fontClass)}>
          <DocsNavPanel nav={nav} pathname={pathname} inputId="docs-search-mobile" autoFocus={focusSearch} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="min-w-0 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">{children}</div>
    </div>
  );
}

function DocsNavPanel({
  nav,
  pathname,
  inputId,
  autoFocus,
  onNavigate,
}: {
  nav: DocsNav;
  pathname: string;
  inputId: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div>
      <DocsSearch query={query} setQuery={setQuery} inputId={inputId} autoFocus={autoFocus} />
      {query.trim() ? (
        <DocsSearchResults query={query} onNavigate={() => { setQuery(""); onNavigate?.(); }} />
      ) : (
        <nav aria-label="Docs">
          <Link
            href="/docs"
            onClick={onNavigate}
            aria-current={pathname === "/docs" ? "page" : undefined}
            className={cn(itemClass, "mt-4", pathname === "/docs" && activeClass)}
          >
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
            <L en="Docs home" th="หน้าแรกเอกสาร" />
          </Link>
          {nav.sections
            .filter((s) => s.id !== "start" && s.pages.length)
            .map((s) => (
              <div key={s.id} className="mt-5">
                <p className="px-4 pb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                  <L en={s.label.en} th={s.label.th} />
                </p>
                <ul className="space-y-0.5">
                  {s.pages.map((p) => {
                    const href = pagePath(p.slug);
                    const active = pathname === href;
                    return (
                      <li key={p.slug}>
                        <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(itemClass, active && activeClass)}>
                          <span className="min-w-0">{p.navTitle}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </nav>
      )}
    </div>
  );
}

// M3 navigation drawer item: full pill, state layer on hover/focus, filled "secondary container" when active.
const itemClass = "docs-state focus-ring flex min-h-9 items-center gap-3 rounded-full px-4 py-1.5 text-[13.5px] leading-snug text-muted";
const activeClass = "docs-active font-semibold";

function DocsSearch({ query, setQuery, inputId, autoFocus }: { query: string; setQuery: (q: string) => void; inputId: string; autoFocus?: boolean }) {
  const { t } = useLang();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
      <label htmlFor={inputId} className="sr-only">
        {t("docs.search")}
      </label>
      <input
        ref={ref}
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        placeholder={t("docs.searchPlaceholder")}
        autoComplete="off"
        spellCheck={false}
        className="focus-ring h-11 w-full rounded-full border border-border bg-surface-2 pl-10 pr-12 text-sm text-fg placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            ref.current?.focus();
          }}
          className="docs-state focus-ring absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-subtle"
          aria-label={t("nav.close")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 lg:inline-flex">
          <Kbd>/</Kbd>
        </span>
      )}
    </div>
  );
}

let indexPromise: Promise<SearchEntry[]> | null = null;
function loadIndex() {
  indexPromise ??= fetch("/docs-search-index.json").then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<SearchEntry[]>;
  });
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

function DocsSearchResults({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const { t } = useLang();
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    loadIndex().then(
      (e) => live && setEntries(e),
      () => live && setError(true)
    );
    return () => {
      live = false;
    };
  }, []);
  const hits = useMemo(() => (entries ? searchDocs(entries, query) : []), [entries, query]);

  if (error) return <p className="px-4 py-6 text-sm text-muted">{t("docs.searchError")}</p>;
  if (!entries) return <p className="px-4 py-6 text-sm text-muted" role="status">{t("docs.searchLoading")}</p>;
  return (
    <div className="mt-3">
      <p className="px-4 pb-2 text-xs text-subtle" role="status" aria-live="polite">
        {hits.length} {t("docs.searchResults")}
      </p>
      {hits.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">{t("docs.searchEmpty")}</p>
      ) : (
        <ul className="space-y-1" data-testid="docs-search-results">
          {hits.map((h) => (
            <li key={`${h.slug}#${h.id}`}>
              <Link href={`${pagePath(h.slug)}${h.id ? `#${h.id}` : ""}`} onClick={onNavigate} className="docs-state focus-ring block rounded-2xl px-4 py-2.5">
                <span className="block text-[13.5px] font-medium text-fg">
                  {h.title}
                  {h.id && <span className="text-subtle"> › {h.heading}</span>}
                </span>
                {h.snippet && (
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-subtle">
                    {h.snippet.before}
                    {h.snippet.match && <mark className="rounded-sm bg-primary-soft px-0.5 text-primary-soft-fg">{h.snippet.match}</mark>}
                    {h.snippet.after}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
