// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PluginsPage from "@/app/plugins/page";
import { PluginDetail } from "@/components/plugins/plugin-detail";
import { PLUGIN_SOURCE, PLUGINS } from "@/lib/plugins/catalog";
import sitemap from "@/app/sitemap";
import { validateCatalog, toSnapshot } from "../scripts/sync-plugin-catalog.mjs";

describe("plugin catalog", () => {
  it("is a valid snapshot pinned to a full commit of devstack-plugins", () => {
    expect(PLUGIN_SOURCE.repo).toBe("agents-sdk-space/devstack-plugins");
    expect(PLUGIN_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(PLUGIN_SOURCE.license).toBe("MIT");
    expect(validateCatalog({ plugins: PLUGINS })).toEqual([]);
    expect(toSnapshot({ plugins: PLUGINS }, PLUGIN_SOURCE.commit)).toEqual({ source: PLUGIN_SOURCE, plugins: PLUGINS });
    for (const p of PLUGINS) {
      expect(p.homepage).toMatch(/^https:\/\//);
      expect(p.source).toMatch(/^https:\/\/github\.com\//);
    }
  });

  it("rejects unsafe or malformed entries", () => {
    const bad = { name: "x", description: "long enough text", category: "development", homepage: "javascript:alert(1)", source: "https://evil.example/x", keywords: ["x"] };
    const errors = validateCatalog({ plugins: [bad, { ...bad, homepage: "https://ok.dev", source: "https://github.com/a/b", extra: 1 }] });
    expect(errors.join("\n")).toMatch(/homepage must be https/);
    expect(errors.join("\n")).toMatch(/bad source/);
    expect(errors.join("\n")).toMatch(/unknown key extra/);
  });

  it("lists every plugin and filters by category", async () => {
    const user = userEvent.setup();
    render(<PluginsPage />);
    expect(screen.getAllByRole("article")).toHaveLength(PLUGINS.length);
    const cat = PLUGINS[0].category;
    await user.click(screen.getByRole("button", { name: new RegExp(`^${cat}$`, "i") }));
    expect(screen.getAllByRole("article")).toHaveLength(PLUGINS.filter((p) => p.category === cat).length);
    for (const a of screen.getAllByRole("link", { name: /Source/ })) {
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("target")).toBe("_blank");
    }
  });

  it("renders a detail page with external links only", () => {
    const p = PLUGINS[0];
    render(<PluginDetail name={p.name} />);
    expect(screen.getByRole("heading", { level: 1, name: p.name })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Homepage/ }).getAttribute("href")).toBe(p.homepage);
  });

  it("adds plugin pages to the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/plugins"))).toBe(true);
    for (const p of PLUGINS) expect(urls.some((u) => u.endsWith(`/plugins/${p.name}`))).toBe(true);
  });
});
