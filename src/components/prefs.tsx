"use client";

import { useCallback, useSyncExternalStore } from "react";
import { translate, type DictKey } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

/**
 * Language + theme preferences live on <html> (set before paint by an inline script
 * in layout.tsx) and in localStorage. useSyncExternalStore keeps SSR and hydration consistent.
 */

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() {
  listeners.forEach((l) => l());
}

function getLang(): Lang {
  return document.documentElement.dataset.lang === "th" ? "th" : "en";
}
function getDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, () => "en" as Lang);
  const setLang = useCallback((next: Lang) => {
    document.documentElement.dataset.lang = next;
    document.documentElement.lang = next;
    try {
      localStorage.setItem("nvx-lang", next);
    } catch {}
    emit();
  }, []);
  const t = useCallback((key: DictKey) => translate(lang, key), [lang]);
  return { lang, setLang, t };
}

export function useDarkMode() {
  const dark = useSyncExternalStore(subscribe, getDark, () => true); // server: dark is the default theme
  const toggle = useCallback(() => {
    const next = !getDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("nvx-theme", next ? "dark" : "light");
    } catch {}
    emit();
  }, []);
  return { dark, toggle };
}

/** Render text in the current language. Usable from Server Components. */
export function T({ k }: { k: DictKey }) {
  const { t } = useLang();
  return <>{t(k)}</>;
}

export function L({ en, th }: { en: string; th: string }) {
  const { lang } = useLang();
  return <>{lang === "th" ? th : en}</>;
}
