// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Mascot, MASCOT_EYES } from "@/components/brand/mascot";

const root = join(__dirname, "..");

describe("Mascot", () => {
  it("is decorative by default and draws two blinking eyes over the body image", () => {
    const { getByTestId } = render(<Mascot size={28} />);
    const el = getByTestId("nvx-mascot");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.width).toBe("28px");
    expect(el.querySelectorAll(".nvx-mascot-eye")).toHaveLength(2);
    const img = el.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("src")).toBe("/brand/mascot-body-64.webp");
  });

  it("exposes an accessible name when labelled and uses large assets for big sizes", () => {
    const { getByRole } = render(<Mascot size={112} label="NVX mascot" />);
    const el = getByRole("img", { name: "NVX mascot" });
    expect(el.querySelector("img")!.getAttribute("srcset")).toContain("mascot-body-512.png 2x");
  });

  it("squishes on click when interactive (reduced motion off)", () => {
    const { getByTestId } = render(<Mascot size={112} interactive />);
    const el = getByTestId("nvx-mascot");
    fireEvent.click(el);
    expect(el.classList.contains("is-squish")).toBe(true);
  });

  it("gradient ids are unique per instance", () => {
    const { container } = render(
      <>
        <Mascot size={28} />
        <Mascot size={112} />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("eye geometry matches the generator that paints the eyes out of the body", () => {
    const py = readFileSync(join(root, "scripts/gen-brand-assets.py"), "utf8");
    const centres = [...py.matchAll(/\(([\d.]+), ([\d.]+), \d+, \d+, [\d.]+\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(centres).toEqual(MASCOT_EYES.map((e) => [e.cx, e.cy]));
  });

  it("all brand assets referenced by the app exist", () => {
    for (const f of [
      "public/brand/mascot-body-64.webp",
      "public/brand/mascot-body-96.webp",
      "public/brand/mascot-body-256.png",
      "public/brand/mascot-body-512.png",
      "public/icon-192.png",
      "public/icon-512.png",
      "public/icon-maskable-512.png",
      "src/app/favicon.ico",
      "src/app/icon.png",
      "src/app/apple-icon.png",
      "src/app/opengraph-image.png",
    ]) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
  });
});
