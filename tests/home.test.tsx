// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home, { metadata } from "@/app/page";
import { translate } from "@/lib/i18n";
import { APP_TSX, sandboxFiles } from "@/components/home/sandbox-files";

describe("home page (v0.9 phase 2)", () => {
  it("has no nvm command or mention, in either language", () => {
    const { container } = render(<Home />);
    expect(container.textContent).not.toMatch(/\bnvm\b/i);
    expect(container.textContent).toContain("git push origin main");
    for (const k of ["hero.title", "hero.subtitle", "hero.badge"] as const) {
      expect(translate("en", k)).not.toMatch(/\bnvm\b/i);
      expect(translate("th", k)).not.toMatch(/\bnvm\b/i);
    }
    expect(JSON.stringify(metadata)).not.toMatch(/\bnvm\b/i);
  });

  it("shows at most three templates plus a link to the catalogue", () => {
    render(<Home />);
    const templateLinks = screen.getAllByRole("link").filter((a) => /^\/templates\/.+/.test(a.getAttribute("href") ?? ""));
    expect(templateLinks.length).toBeLessThanOrEqual(3);
    expect(screen.getByRole("link", { name: /See all templates/ }).getAttribute("href")).toBe("/templates");
  });

  it("has the steps, the FAQ and the video slot", () => {
    const { container } = render(<Home />);
    expect(screen.getByRole("heading", { name: "Three steps to a live site" })).toBeTruthy();
    expect(container.querySelectorAll("details").length).toBe(4);
    expect(container.querySelector('[data-slot="howto-video"]')).toBeTruthy();
    expect(container.querySelectorAll(".focus-frame").length).toBe(1);
    expect(container.querySelector('[data-testid="live-example"]')).toBeTruthy();
  });

  it("states only what works today, including the limits and what is not supported", () => {
    const { container } = render(<Home />);
    expect(container.querySelectorAll('[data-testid="capabilities"] li').length).toBe(6);
    const text = container.textContent ?? "";
    for (const s of ["Import a GitHub repo", "15.5.28", "20 AI requests and 10 builds per day", "custom domains", "npx devstack-bid"]) expect(text).toContain(s);
    expect(text).not.toMatch(/ready to copy|setup\.sh/);
    expect(screen.getAllByRole("link", { name: /Start a new project/ })[0].getAttribute("href")).toBe("/new");
  });

  it("live example matches the owner's reference sandbox shape", () => {
    expect(APP_TSX).toContain("Welcome to my app");
    expect(APP_TSX).toContain("I'm a button");
    expect(Object.keys(sandboxFiles(true)).sort()).toEqual(["/App.js", "/index.js", "/src/App.tsx", "/styles.css", "/theme.css"]);
  });
});
