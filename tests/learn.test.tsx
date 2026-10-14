// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import LearnPage from "@/app/learn/page";
import { SetupCursor } from "@/components/setup-cursor";

describe("learn page", () => {
  it("credits the creator and links the homepage ask button here", () => {
    const learn = render(<LearnPage />);
    expect(screen.getByRole("link", { name: "devstack.sdk@gmail.com" }).getAttribute("href")).toBe("mailto:devstack.sdk@gmail.com");
    expect(screen.getByRole("link", { name: /Create with Cursor/ }).getAttribute("href")).toMatch(/^https:\/\/cursor\.com\/link\/prompt\?text=/);
    expect(screen.getByRole("link", { name: /Download Cursor/ }).getAttribute("href")).toBe("https://cursor.com/download");
    expect(screen.getByRole("link", { name: "Ask the AI agent" }).getAttribute("href")).toBe("/builder#agent");
    learn.unmount();

    render(<Home />);
    expect(screen.getByRole("link", { name: "Ask the AI agent" }).getAttribute("href")).toBe("/learn");
  });

  it("opens create or ask from the header control", async () => {
    const user = userEvent.setup();
    render(<SetupCursor />);
    await user.click(screen.getByRole("button", { name: "Setup Cursor: create or ask" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Create with Cursor/ }).getAttribute("href")).toContain("cursor.com/link/prompt");
    expect(screen.getByRole("button", { name: "Ask Cursor" }).hasAttribute("disabled")).toBe(true);
  });
});
