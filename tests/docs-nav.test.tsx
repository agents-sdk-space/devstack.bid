// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/docs/user-guide/downloads", useRouter: () => ({ push: vi.fn() }) }));

import { Header } from "@/components/header";
import { DocsShell } from "@/components/docs/docs-shell";
import { CopyMarkdownButton } from "@/components/docs/doc-article";
import { ToastProvider, TooltipProvider } from "@/components/ui";
import { DOCS_NAV } from "@/lib/docs";

const wrap = (ui: React.ReactNode) => render(<ToastProvider><TooltipProvider>{ui}</TooltipProvider></ToastProvider>);

describe("Docs navigation", () => {
  it("has a Docs link in the desktop nav and the hamburger menu", async () => {
    wrap(<Header />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Docs" }).getAttribute("href")).toBe("/docs");
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const mobile = await screen.findByRole("navigation", { name: "Mobile" });
    expect(within(mobile).getByRole("link", { name: /Docs/ }).getAttribute("href")).toBe("/docs");
  });

  it("drawer lists every page and marks the current one", () => {
    wrap(<DocsShell nav={DOCS_NAV}><p>content</p></DocsShell>);
    const nav = screen.getByRole("navigation", { name: "Docs" });
    const current = within(nav).getByRole("link", { current: "page" });
    expect(current.getAttribute("href")).toBe("/docs/user-guide/downloads");
    const count = DOCS_NAV.sections.flatMap((s) => s.pages).filter((p) => p.slug).length;
    expect(within(nav).getAllByRole("link").length).toBe(count + 1); // + Docs home
  });

  it("Copy Markdown copies the exact raw source", async () => {
    const user = userEvent.setup();
    const raw = "# Title\n\n```bash\nnpm i\n```\n";
    wrap(<CopyMarkdownButton raw={raw} />);
    await user.click(screen.getByTestId("copy-markdown"));
    expect(await navigator.clipboard.readText()).toBe(raw);
  });
});
