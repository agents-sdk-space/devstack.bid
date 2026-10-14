import { describe, expect, it } from "vitest";
import { askPrompt, createPrompt, CURSOR_DOWNLOAD_URL, CURSOR_PROMPT_URL, cursorPromptUrl } from "@/lib/cursor-link";

describe("cursor prompt links", () => {
  it("builds a web deeplink the person confirms in Cursor", () => {
    const url = new URL(cursorPromptUrl(createPrompt("en")));
    expect(url.origin + url.pathname).toBe(CURSOR_PROMPT_URL);
    expect(url.searchParams.get("text")).toContain("https://devstack.bid/templates");
    expect(url.searchParams.get("text")).toContain("does not run commands");
    expect(url.toString().length).toBeLessThan(10000);
  });

  it("keeps the Thai create prompt and the asked question", () => {
    const asked = cursorPromptUrl(askPrompt("th", "ช่วยเริ่มแอป Next.js"));
    const text = new URL(asked).searchParams.get("text") ?? "";
    expect(text).toContain("ช่วยเริ่มแอป Next.js");
    expect(text).toContain("ไม่รันคำสั่ง");
    expect(CURSOR_DOWNLOAD_URL).toBe("https://cursor.com/download");
  });

  it("trims a question and a URL that would pass the deeplink limit", () => {
    const huge = "x".repeat(20000);
    const url = cursorPromptUrl(askPrompt("en", huge));
    expect(url.length).toBeLessThanOrEqual(9000);
    expect(new URL(url).searchParams.get("text")?.length ?? 0).toBeLessThan(8000);
    expect(askPrompt("en", "  hi  ").endsWith("hi")).toBe(true);
  });
});
