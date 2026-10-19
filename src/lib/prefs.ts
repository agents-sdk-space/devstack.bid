/**
 * Display preferences: one definition shared by the browser store (src/components/prefs.tsx), the
 * pre-paint boot script (layout.tsx), the account sync API (src/app/api/preferences) and the tests.
 * Pure module: no DOM, no server-only imports.
 *
 * Storage keys: `nvx-theme` and `nvx-lang` are the original keys and keep their meaning.
 * `nvx-theme` used to hold only "light" | "dark"; "system" is the new third value.
 */

export const PREF_KEYS = {
  theme: "nvx-theme",
  lang: "nvx-lang",
  chatFont: "nvx-chat-font",
  chatSize: "nvx-chat-size",
  chatWidth: "nvx-chat-width",
  motion: "nvx-motion",
} as const;

/** Time (ms) of the last local change; compared with the server copy when signing in. */
export const PREFS_AT_KEY = "nvx-prefs-at";

export const PREF_OPTIONS = {
  theme: ["system", "light", "dark"],
  lang: ["th", "en"],
  /** default = Inter + IBM Plex Sans Thai, thai = IBM Plex Sans Thai first, mono = IBM Plex Mono (fonts loaded in layout.tsx). */
  chatFont: ["default", "thai", "mono"],
  chatSize: ["small", "medium", "large"],
  chatWidth: ["narrow", "medium", "wide"],
  /** system = follow prefers-reduced-motion, reduced = always reduce. */
  motion: ["system", "reduced"],
} as const;

export type PrefKey = keyof typeof PREF_OPTIONS;
export type Prefs = { [K in PrefKey]: (typeof PREF_OPTIONS)[K][number] };

/**
 * Defaults. Dark stays the default theme for everyone (it does not follow the OS until the user picks "system");
 * the real default language comes from the browser (see PREFS_BOOT_SCRIPT), "en" is only the server render.
 */
export const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  lang: "en",
  chatFont: "default",
  chatSize: "medium",
  chatWidth: "medium",
  motion: "system",
};

export const PREF_KEY_LIST = Object.keys(PREF_OPTIONS) as PrefKey[];

export function isPrefValue<K extends PrefKey>(key: K, value: unknown): value is Prefs[K] {
  return typeof value === "string" && (PREF_OPTIONS[key] as readonly string[]).includes(value);
}

/** Keep only known keys with known values. Used for localStorage reads, the sync API and remote data. */
export function sanitizePrefs(input: unknown): Partial<Prefs> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out as Partial<Prefs>;
  const record = input as Record<string, unknown>;
  for (const key of PREF_KEY_LIST) {
    const value = record[key];
    if (isPrefValue(key, value)) out[key] = value;
  }
  return out as Partial<Prefs>;
}

export function resolveDark(theme: Prefs["theme"], systemDark: boolean): boolean {
  return theme === "system" ? systemDark : theme === "dark";
}

/**
 * Runs before first paint (inline in <head>): applies theme, language and chat display settings from
 * localStorage without a flash. Mirrors applyPref() in src/components/prefs.tsx; tests/preferences.test.tsx
 * runs both against the same storage.
 */
export const PREFS_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s=localStorage,O=${JSON.stringify(PREF_OPTIONS)},K=${JSON.stringify(PREF_KEYS)};function pick(k,f){var v=null;try{v=s.getItem(K[k])}catch(e){}return O[k].indexOf(v)>-1?v:f}var t=pick('theme','dark');var dark=t==='system'?matchMedia('(prefers-color-scheme: dark)').matches:t==='dark';d.classList.toggle('dark',dark);d.dataset.theme=t;var l=pick('lang',((navigator.language||'').toLowerCase().indexOf('th')===0?'th':'en'));d.dataset.lang=l;d.lang=l;d.dataset.chatFont=pick('chatFont','default');d.dataset.chatSize=pick('chatSize','medium');d.dataset.chatWidth=pick('chatWidth','medium');d.dataset.motion=pick('motion','system')}catch(e){}})();`;
