"use client";

import { useCallback, useSyncExternalStore } from "react";
import { translate, type DictKey } from "@/lib/i18n";
import { DEFAULT_PREFS, isPrefValue, PREF_KEY_LIST, PREF_KEYS, PREFS_AT_KEY, resolveDark, sanitizePrefs, type PrefKey, type Prefs } from "@/lib/prefs";
import type { Lang } from "@/lib/types";

/**
 * Display preferences (language, theme, chat font/size/width, motion) live on <html> (set before paint by
 * PREFS_BOOT_SCRIPT in layout.tsx) and in localStorage. useSyncExternalStore keeps SSR and hydration
 * consistent. Signed-in users also sync these values through /api/preferences (see prefs-sync.tsx).
 * Keys, values and defaults are defined once in src/lib/prefs.ts.
 */

const listeners = new Set<() => void>();
const changeListeners = new Set<() => void>();
let systemQuery: MediaQueryList | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function systemDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

/** The OS colour scheme only matters while the theme is "system". */
function onSystemChange() {
  if (document.documentElement.dataset.theme === "system") {
    document.documentElement.classList.toggle("dark", systemDark());
    emit();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    try {
      systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
      systemQuery.addEventListener("change", onSystemChange);
    } catch {
      systemQuery = null;
    }
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && systemQuery) {
      systemQuery.removeEventListener("change", onSystemChange);
      systemQuery = null;
    }
  };
}

/** Put one preference on <html> (class, data attributes). Mirrors PREFS_BOOT_SCRIPT. */
function applyPref(key: PrefKey, value: string) {
  const html = document.documentElement;
  if (key === "theme") {
    html.dataset.theme = value;
    html.classList.toggle("dark", resolveDark(value as Prefs["theme"], systemDark()));
  } else if (key === "lang") {
    html.dataset.lang = value;
    html.lang = value;
  } else if (key === "chatFont") html.dataset.chatFont = value;
  else if (key === "chatSize") html.dataset.chatSize = value;
  else if (key === "chatWidth") html.dataset.chatWidth = value;
  else if (key === "motion") html.dataset.motion = value;
}

function readStored(key: PrefKey): string | null {
  try {
    return localStorage.getItem(PREF_KEYS[key]);
  } catch {
    return null;
  }
}

/** Only the values the user explicitly chose (what is synced to the account). */
export function readStoredPrefs(): Partial<Prefs> {
  const raw: Record<string, string | null> = {};
  for (const key of PREF_KEY_LIST) raw[key] = readStored(key);
  return sanitizePrefs(raw);
}

export function readPrefsStamp(): number {
  try {
    const n = Number(localStorage.getItem(PREFS_AT_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writePrefsStamp(at: number) {
  try {
    localStorage.setItem(PREFS_AT_KEY, String(at));
  } catch {}
}

/** Change one preference: applies it now, stores it in this browser and tells the sync listener. */
export function setPref<K extends PrefKey>(key: K, value: Prefs[K], opts: { silent?: boolean } = {}) {
  if (!isPrefValue(key, value)) return;
  applyPref(key, value);
  try {
    localStorage.setItem(PREF_KEYS[key], value);
  } catch {}
  if (!opts.silent) writePrefsStamp(Date.now());
  emit();
  if (!opts.silent) changeListeners.forEach((l) => l());
}

/** Apply the account's saved values (from /api/preferences) without marking them as a local change. */
export function applyRemotePrefs(remote: Partial<Prefs>, at: number) {
  for (const key of PREF_KEY_LIST) {
    const value = remote[key];
    if (value !== undefined) setPref(key, value as Prefs[typeof key], { silent: true });
  }
  writePrefsStamp(at);
}

/** Called after every local change; prefs-sync.tsx uses it to push to the account. Returns an unsubscribe. */
export function subscribePrefChanges(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

export type SyncState = "local" | "syncing" | "synced" | "error";
let syncState: SyncState = "local";
const syncListeners = new Set<() => void>();
export function setSyncState(next: SyncState) {
  if (next === syncState) return;
  syncState = next;
  syncListeners.forEach((l) => l());
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      syncListeners.add(cb);
      return () => {
        syncListeners.delete(cb);
      };
    },
    () => syncState,
    () => "local" as SyncState
  );
}

let cached: Prefs = DEFAULT_PREFS;
let cachedKey = JSON.stringify(DEFAULT_PREFS);

function attr<K extends PrefKey>(key: K, raw: string | undefined): Prefs[K] {
  return isPrefValue(key, raw) ? raw : DEFAULT_PREFS[key];
}

/** Effective preferences, read from <html> (the single source the boot script and setPref both write). */
function getPrefs(): Prefs {
  const d = document.documentElement.dataset;
  const next: Prefs = {
    theme: attr("theme", d.theme),
    lang: d.lang === "th" ? "th" : "en",
    chatFont: attr("chatFont", d.chatFont),
    chatSize: attr("chatSize", d.chatSize),
    chatWidth: attr("chatWidth", d.chatWidth),
    motion: attr("motion", d.motion),
  };
  const key = JSON.stringify(next);
  if (key === cachedKey) return cached;
  cachedKey = key;
  cached = next;
  return cached;
}

/** All display preferences plus a typed setter. Server render and hydration use the defaults. */
export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
  return { prefs, set: setPref };
}

function getLang(): Lang {
  return document.documentElement.dataset.lang === "th" ? "th" : "en";
}
function getDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, () => "en" as Lang);
  const setLang = useCallback((next: Lang) => setPref("lang", next), []);
  const t = useCallback((key: DictKey) => translate(lang, key), [lang]);
  return { lang, setLang, t };
}

/** Header toggle: flips between the explicit light and dark themes (from "system" it goes to the opposite of what is shown). */
export function useDarkMode() {
  const dark = useSyncExternalStore(subscribe, getDark, () => true); // server: dark is the default theme
  const toggle = useCallback(() => setPref("theme", getDark() ? "light" : "dark"), []);
  return { dark, toggle };
}

/** True when the user asked for less motion here ("reduced") or in the OS (prefers-reduced-motion). */
export function prefersReducedMotion(): boolean {
  try {
    if (document.documentElement.dataset.motion === "reduced") return true;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
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
