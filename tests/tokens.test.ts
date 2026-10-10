import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_GROUPS } from "@/lib/design-tokens";

/** Parse `--nvx-*: #hex` declarations from one block of tokens.css. */
function parseBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--nvx-([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

type RGBA = [number, number, number, number];
/** Parses #rrggbb and `rgb(r g b / a)`. */
function parseColor(value: string): RGBA {
  if (value.startsWith("#")) {
    const n = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)).concat(1) as RGBA;
  }
  const m = value.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (!m) throw new Error(`Unsupported colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 1];
}
/** Composite a (possibly translucent) colour over an opaque backdrop. */
function over([r, g, b, a]: RGBA, [br, bg, bb]: RGBA): RGBA {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}
function luminance([r, g, b]: RGBA): number {
  const [R, G, B] = [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
/** Contrast of fg on bg, where translucent backgrounds sit on the theme's surface colour. */
function contrast(vars: Record<string, string>, fg: string, bg: string): number {
  const surface = parseColor(vars.surface);
  const back = over(parseColor(vars[bg]), surface);
  const front = over(parseColor(vars[fg]), back);
  const [l1, l2] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const css = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");
const light = parseBlock(css, ":root");
const darkOverrides = parseBlock(css, ".dark");
// .dark only overrides what differs; everything else cascades from :root.
const themes = { light, dark: { ...light, ...darkOverrides } };

describe("design tokens", () => {
  it("dark only overrides tokens that exist in the light theme", () => {
    for (const name of Object.keys(darkOverrides)) expect(light[name], name).toBeDefined();
  });

  it("dark overrides every colour role that sits on a surface", () => {
    for (const name of ["bg", "surface", "fg", "muted", "subtle", "primary", "primary-fg", "border", "ring", "danger", "success"]) {
      expect(darkOverrides[name], name).toBeDefined();
    }
  });

  it("every token documented on /design exists in tokens.css", () => {
    for (const group of COLOR_GROUPS) for (const tok of group.tokens) expect(themes.light[tok.name], tok.name).toBeDefined();
  });

  // WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text / UI components.
  const TEXT_PAIRS: [fg: string, bg: string, min: number][] = [
    ["fg", "bg", 4.5],
    ["fg", "surface", 4.5],
    ["fg", "surface-2", 4.5],
    ["muted", "surface", 4.5],
    ["muted", "bg", 4.5],
    ["subtle", "surface", 4.5],
    ["subtle", "bg", 4.5],
    ["subtle", "surface-2", 4.5],
    ["primary-fg", "primary", 4.5],
    ["primary-fg", "primary-hover", 4.5],
    ["primary-soft-fg", "primary-soft", 4.5],
    ["primary-soft-fg", "surface", 4.5],
    ["link", "surface", 4.5],
    ["link", "bg", 4.5],
    ["accent", "surface", 4.5],
    ["success-fg", "success-soft", 4.5],
    ["warning-fg", "warning-soft", 4.5],
    ["danger-fg", "danger-soft", 4.5],
    ["info-fg", "info-soft", 4.5],
    ["success", "surface", 4.5],
    ["warning", "surface", 4.5],
    ["info", "surface", 4.5],
    ["danger", "surface", 4.5],
    ["code-fg", "code-bg", 4.5],
    ["code-prompt", "code-bg", 4.5],
    ["code-muted", "code-bg", 4.5],
    // Non-text UI (WCAG 1.4.11): filled buttons, focus ring and input borders need 3:1.
    ["primary", "surface", 3],
    ["primary", "bg", 3],
    ["ring", "surface", 3],
    ["ring", "bg", 3],
    ["border-strong", "surface", 1.4],
    ["border-strong", "bg", 1.4],
  ];

  for (const [theme, vars] of Object.entries(themes)) {
    for (const [fg, bg, min] of TEXT_PAIRS) {
      it(`${theme}: ${fg} on ${bg} ≥ ${min}:1`, () => {
        expect(contrast(vars, fg, bg)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

describe("default theme", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  it("server-renders the terminal (dark) theme on <html>", () => {
    expect(layout).toMatch(/className=\{`dark /);
  });
  it("pre-paint script only switches to light on an explicit saved choice (ignores OS preference)", () => {
    expect(layout).toContain("var dark=t!=='light'");
    expect(layout).not.toContain("prefers-color-scheme: dark)').matches");
  });
});
