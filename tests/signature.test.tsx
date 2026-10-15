// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SIGNATURE_COMMAND_CONFIG, SIGNATURE_COMMANDS, TerminalSignature } from "@/components/brand/terminal-signature";
import { Footer } from "@/components/header";

describe("TerminalSignature", () => {
  it("renders an accessible terminal with four tool tiles", () => {
    const { container } = render(<TerminalSignature animate={false} />);
    expect(screen.getByRole("img", { name: /DevStack terminal/ })).toBeTruthy();
    const tiles = container.querySelectorAll(".sig-tile");
    expect([...tiles].map((t) => t.getAttribute("title"))).toEqual(["JavaScript", "curl", "npm", "PyPI"]);
    expect(container.querySelectorAll(".sig-mark path").length).toBe(3); // simple-icons JS, npm, Python
    expect(container.querySelector(".sig-curl")?.textContent).toBe("curl://");
  });

  it("is static when not animated: shows the curl command with its tile lit", () => {
    const { container } = render(<TerminalSignature animate={false} />);
    expect(container.querySelector(".sig-typed")?.textContent).toBe("curl -fsSL https://devstack.bid/llms.txt");
    expect(container.querySelector('.sig-tile[data-active="true"]')?.getAttribute("title")).toBe("curl");
    expect(container.querySelector(".sig")?.getAttribute("data-live")).toBe("false");
  });

  it("shows only published, real commands; nvxdev placeholders stay hidden", () => {
    expect(SIGNATURE_COMMANDS.every((c) => c.published)).toBe(true);
    for (const c of SIGNATURE_COMMANDS) expect(c.text).not.toMatch(/nvxdev/);
    expect(SIGNATURE_COMMANDS.map((c) => c.tile)).toEqual(["js", "curl", "npm", "pypi"]);
    const placeholders = SIGNATURE_COMMAND_CONFIG.filter((c) => c.text.includes("nvxdev"));
    expect(placeholders.map((c) => c.text)).toEqual(["npx nvxdev init", "pip install nvxdev"]);
    expect(placeholders.every((c) => !c.published)).toBe(true);
  });

  it("never renders 'coming soon' or nvxdev text", () => {
    const { container } = render(<TerminalSignature animate={false} />);
    expect(container.textContent).not.toMatch(/coming soon|nvxdev/i);
  });

  it("is part of the footer shown on every page", () => {
    const { container } = render(<Footer />);
    expect(container.querySelector("footer .sig")).not.toBeNull();
  });
});

describe("app-style pages", () => {
  it("drop the footer only on /chat", async () => {
    const { hidesFooter } = await import("@/components/header");
    expect(hidesFooter("/chat")).toBe(true);
    expect(hidesFooter("/chat/dev")).toBe(true);
    expect(hidesFooter("/chatter")).toBe(false);
    expect(hidesFooter("/login")).toBe(false);
    expect(hidesFooter(null)).toBe(false);
  });
});
