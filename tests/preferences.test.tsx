// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralSettings } from "@/components/settings/general-settings";
import { SettingsNav } from "@/components/settings-nav";
import { ChatPlusMenu } from "@/components/chat/chat-plus-menu";
import { L, setPref, useLang } from "@/components/prefs";
import type { D1Like } from "@/lib/chat/store";
import { DEFAULT_PREFS, PREF_KEYS, PREF_OPTIONS, PREFS_BOOT_SCRIPT, resolveDark, sanitizePrefs } from "@/lib/prefs";
import { loadPrefs, savePrefs } from "@/lib/preferences-store";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));

const html = document.documentElement;

/** matchMedia whose "dark" answer can be flipped, with change listeners (what the OS does). */
function mockSystemScheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  window.matchMedia = ((q: string) => ({
    get matches() {
      return q.includes("prefers-color-scheme: dark") ? dark : false;
    },
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    dark = next;
    listeners.forEach((l) => l());
  };
}

/** What a page refresh does: wipe <html> and run the pre-paint script against localStorage. */
function refresh() {
  html.className = "dark";
  for (const a of ["theme", "lang", "chatFont", "chatSize", "chatWidth", "motion"]) delete html.dataset[a];
  new Function(PREFS_BOOT_SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  mockSystemScheme(true);
  html.className = "dark";
  refresh();
});

describe("preference definitions", () => {
  it("keeps the original storage keys", () => {
    expect(PREF_KEYS.theme).toBe("nvx-theme");
    expect(PREF_KEYS.lang).toBe("nvx-lang");
  });

  it("offers exactly the requested options", () => {
    expect(PREF_OPTIONS.theme).toEqual(["system", "light", "dark"]);
    expect(PREF_OPTIONS.lang).toEqual(["th", "en"]);
    expect(PREF_OPTIONS.chatSize).toEqual(["small", "medium", "large"]);
    expect(PREF_OPTIONS.chatWidth).toEqual(["narrow", "medium", "wide"]);
    expect(PREF_OPTIONS.motion).toEqual(["system", "reduced"]);
  });

  it("drops unknown keys and values", () => {
    expect(sanitizePrefs({ theme: "light", lang: "fr", evil: "<script>", chatSize: "huge", motion: "reduced" })).toEqual({ theme: "light", motion: "reduced" });
    expect(sanitizePrefs(null)).toEqual({});
    expect(sanitizePrefs(["light"])).toEqual({});
  });

  it("resolves the system theme from the OS", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
  });
});

describe("load after refresh (pre-paint script)", () => {
  it("defaults to dark, medium chat and system motion", () => {
    expect(html.classList.contains("dark")).toBe(true);
    expect(html.dataset.theme).toBe(DEFAULT_PREFS.theme);
    expect(html.dataset.chatSize).toBe("medium");
    expect(html.dataset.motion).toBe("system");
  });

  it("still understands values written by the old version (nvx-theme light / nvx-lang th)", () => {
    localStorage.setItem("nvx-theme", "light");
    localStorage.setItem("nvx-lang", "th");
    refresh();
    expect(html.classList.contains("dark")).toBe(false);
    expect(html.dataset.theme).toBe("light");
    expect(html.lang).toBe("th");
    expect(html.dataset.lang).toBe("th");
  });

  it("ignores corrupted stored values", () => {
    localStorage.setItem("nvx-theme", "purple");
    localStorage.setItem("nvx-chat-width", "<b>");
    refresh();
    expect(html.dataset.theme).toBe("dark");
    expect(html.dataset.chatWidth).toBe("medium");
  });

  it("follows the OS when the theme is system", () => {
    localStorage.setItem("nvx-theme", "system");
    mockSystemScheme(false);
    refresh();
    expect(html.classList.contains("dark")).toBe(false);
    mockSystemScheme(true);
    refresh();
    expect(html.classList.contains("dark")).toBe(true);
  });
});

describe("/settings general controls", () => {
  it("saves every choice to <html> and localStorage, and keeps it after a refresh", () => {
    render(<GeneralSettings />);
    const pick = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

    pick(/^Light$/);
    pick(/^Thai$/);
    pick(/^IBM Plex Mono$/);
    pick(/^Large$/);
    pick(/^Wide$/);
    pick(/^Reduced$/);

    expect(html.classList.contains("dark")).toBe(false);
    expect(html.dataset).toMatchObject({ theme: "light", lang: "th", chatFont: "mono", chatSize: "large", chatWidth: "wide", motion: "reduced" });
    expect(localStorage.getItem("nvx-theme")).toBe("light");
    expect(localStorage.getItem("nvx-lang")).toBe("th");
    expect(localStorage.getItem("nvx-chat-font")).toBe("mono");
    expect(localStorage.getItem("nvx-chat-size")).toBe("large");
    expect(localStorage.getItem("nvx-chat-width")).toBe("wide");
    expect(localStorage.getItem("nvx-motion")).toBe("reduced");

    refresh();
    expect(html.dataset).toMatchObject({ theme: "light", lang: "th", chatFont: "mono", chatSize: "large", chatWidth: "wide", motion: "reduced" });
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("switches the theme to system and tracks OS changes live", () => {
    const setOs = mockSystemScheme(true);
    render(<GeneralSettings />);
    fireEvent.click(screen.getByRole("radio", { name: /^System$/, checked: false }));
    // two "System" radios exist (theme, motion); the first is the theme group
    expect(html.dataset.theme).toBe("system");
    expect(html.classList.contains("dark")).toBe(true);
    act(() => setOs(false));
    expect(html.classList.contains("dark")).toBe(false);
    act(() => setOs(true));
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("changes the language of the page text", () => {
    render(<GeneralSettings />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("General");
    fireEvent.click(screen.getByRole("radio", { name: /^Thai$/ }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ทั่วไป");
    expect(screen.getByRole("radio", { name: "อังกฤษ" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "อังกฤษ" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("General");
  });

  it("says the settings are saved in the browser for guests", () => {
    render(<GeneralSettings />);
    expect(screen.getByRole("status").textContent).toMatch(/Saved in this browser/);
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login?next=/settings");
  });

  it("applies the chat settings to the preview through the same data attributes", () => {
    render(<GeneralSettings />);
    expect(screen.getByTestId("chat-preview").className).toContain("chat-text");
    act(() => setPref("chatSize", "small"));
    expect(html.dataset.chatSize).toBe("small");
  });

  it("rejects values outside the allow-list", () => {
    act(() => setPref("theme", "neon" as never));
    expect(localStorage.getItem("nvx-theme")).toBeNull();
    expect(html.dataset.theme).toBe("dark");
  });
});

describe("language hook", () => {
  function Probe() {
    const { lang, setLang } = useLang();
    return (
      <button onClick={() => setLang(lang === "th" ? "en" : "th")}>
        <L en="Hello" th="สวัสดี" />
      </button>
    );
  }
  it("re-renders translated text when the language changes", () => {
    render(<Probe />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("Hello");
    fireEvent.click(btn);
    expect(btn.textContent).toBe("สวัสดี");
    expect(localStorage.getItem("nvx-lang")).toBe("th");
  });
});

describe("SettingsNav", () => {
  it("links the new General page and keeps the existing pages", () => {
    render(<SettingsNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/settings", "/settings/connections", "/settings/environment", "/settings/mcp", "/settings/cli"]));
    expect(screen.getByRole("link", { name: "General" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("chat + menu", () => {
  it("only links to pages that exist and explains why attaching is off", () => {
    render(<ChatPlusMenu attachHint="Not available yet" />);
    const button = screen.getByRole("button", { name: "More options" });
    fireEvent.click(button);
    const items = screen.getAllByRole("menuitem");
    const attach = items.find((i) => /Attach/.test(i.textContent ?? ""))!;
    expect(attach.getAttribute("aria-disabled")).toBe("true");
    expect(items.filter((i) => i.tagName === "A").map((i) => i.getAttribute("href"))).toEqual(["/settings/connections", "/design", "/plugins"]);
    fireEvent.keyDown(items[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

/** Tiny fake for user_preferences. */
function fakePrefsDb() {
  const rows = new Map<string, { prefs_json: string; updated_at: number }>();
  const stmt = (sql: string, a: unknown[] = []) => ({
    bind: (...x: unknown[]) => stmt(sql, x),
    async first() {
      return (sql.startsWith("SELECT") ? rows.get(a[0] as string) ?? null : null) as never;
    },
    async run() {
      if (sql.startsWith("INSERT INTO user_preferences")) rows.set(a[0] as string, { prefs_json: a[1] as string, updated_at: a[2] as number });
      return {};
    },
    async all() {
      return { results: [] };
    },
  });
  return { rows, db: { prepare: (s: string) => stmt(s) as never, batch: async () => [] } as D1Like };
}

describe("account sync store", () => {
  it("stores only allow-listed values and reads them back", async () => {
    const { db, rows } = fakePrefsDb();
    const saved = await savePrefs(db, "u1", { theme: "system", lang: "th", chatSize: "huge", extra: "x" }, 1234);
    expect(saved).toEqual({ prefs: { theme: "system", lang: "th" }, updatedAt: 1234 });
    expect(JSON.parse(rows.get("u1")!.prefs_json)).toEqual({ theme: "system", lang: "th" });
    expect(await loadPrefs(db, "u1")).toEqual({ prefs: { theme: "system", lang: "th" }, updatedAt: 1234 });
  });

  it("returns null for a user with nothing saved and survives a corrupt row", async () => {
    const { db, rows } = fakePrefsDb();
    expect(await loadPrefs(db, "nobody")).toBeNull();
    rows.set("u2", { prefs_json: "{not json", updated_at: 5 });
    expect(await loadPrefs(db, "u2")).toEqual({ prefs: {}, updatedAt: 5 });
  });

  it("keeps each user's row separate", async () => {
    const { db } = fakePrefsDb();
    await savePrefs(db, "a", { theme: "light" }, 1);
    await savePrefs(db, "b", { theme: "dark" }, 2);
    expect((await loadPrefs(db, "a"))?.prefs.theme).toBe("light");
    expect((await loadPrefs(db, "b"))?.prefs.theme).toBe("dark");
  });
});
