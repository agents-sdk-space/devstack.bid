// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_ICONS } from "@/components/brand/brand-icons.data";
import { commandTool, templateTool, ToolIcon, ToolTile } from "@/components/brand/tool-icon";
import { TEMPLATES } from "@/data/templates";

describe("tool icons", () => {
  it("every template maps to a tool tile", () => {
    for (const t of TEMPLATES) {
      const id = templateTool(t);
      expect(id === "ai" || id in BRAND_ICONS, `${t.id} → ${id}`).toBe(true);
    }
  });

  it("commandTool recognises well-known CLIs", () => {
    expect(commandTool(["npx create-next-app@latest app"])).toBe("npm");
    expect(commandTool(["pnpm install"])).toBe("pnpm");
    expect(commandTool(["python -m pytest"])).toBe("pytest");
    expect(commandTool(["pip install fastapi"])).not.toBe("terminal");
    expect(commandTool(["echo hello"])).toBe("terminal");
  });

  it("ToolIcon renders a labelled img when given a title, decorative otherwise", () => {
    const { container, rerender } = render(<ToolIcon id="node" title="Node.js" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Node.js");
    rerender(<ToolIcon id="node" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("ToolTile is decorative unless labelled", () => {
    const { container } = render(<ToolTile id="react" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("no emoji in UI source", () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{2714}\u{2716}\u{274C}\u{2728}]/u;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css|json)$/.test(p) ? [p] : [];
    });
  it("src/ contains no emoji icons", () => {
    const offenders = walk(join(process.cwd(), "src")).filter((p) => EMOJI.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
