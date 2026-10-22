/**
 * Deterministic design for the static-website template, derived from the project name + description.
 * Hues in the indigo/violet/purple band (235°–315°) are never chosen, so no project is forced purple.
 */
export interface WebsiteTheme {
  primary: string; primaryInk: string; accent: string; bg: string; surface: string; fg: string; muted: string;
  radius: string; font: string; layout: "centered" | "split"; hue: number; dark: boolean;
}

/** FNV-1a 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function hex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

export const BANNED_HUES: [number, number] = [235, 315];
/** Usable hues: 0–234 and 316–359 (280 values). */
export function pickHue(n: number): number {
  const span = 360 - (BANNED_HUES[1] - BANNED_HUES[0] + 1);
  const i = n % span;
  return i < BANNED_HUES[0] ? i : i + (BANNED_HUES[1] - BANNED_HUES[0] + 1);
}

const FONTS = [
  'system-ui, -apple-system, "Segoe UI", sans-serif',
  'Georgia, "Times New Roman", serif',
  '"Trebuchet MS", "Helvetica Neue", Arial, sans-serif',
  '"Palatino Linotype", Palatino, "Book Antiqua", serif',
  'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
];
const RADII = ["4px", "10px", "18px", "999px"];

export function websiteTheme(name: string, description = ""): WebsiteTheme {
  const h = hash(`${name.trim().toLowerCase()}\n${description.trim().toLowerCase()}`);
  const hue = pickHue(h);
  const accentHue = pickHue(h + 37 + ((h >>> 9) % 60));
  const dark = ((h >>> 16) & 3) === 0; // about one in four sites is dark
  const primary = hex(hue, 70, dark ? 58 : 38);
  return {
    hue, dark, primary,
    primaryInk: dark ? "#0b0f14" : "#ffffff",
    accent: hex(accentHue, 75, dark ? 62 : 42),
    bg: dark ? hex(hue, 25, 8) : hex(hue, 40, 97),
    surface: dark ? hex(hue, 22, 13) : "#ffffff",
    fg: dark ? "#eef2f6" : hex(hue, 30, 12),
    muted: dark ? "#a3adb8" : hex(hue, 12, 38),
    radius: RADII[(h >>> 4) % RADII.length],
    font: FONTS[(h >>> 7) % FONTS.length],
    layout: (h >>> 12) % 2 ? "split" : "centered",
  };
}
