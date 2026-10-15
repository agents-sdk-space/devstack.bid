import { describe, expect, it } from "vitest";
import { graphemeSegmenter, markdownStablePrefix, RevealBuffer, revealStepSize, splitGraphemes } from "@/lib/chat/stream-buffer";

describe("stream buffer (grapheme reveal)", () => {
  it("does not split Thai combining marks mid-grapheme", () => {
    const thai = "สวัสดี";
    const segs = splitGraphemes(thai, graphemeSegmenter("th"));
    expect(segs.join("")).toBe(thai);
    expect(segs.length).toBeGreaterThan(0);
    const buf = new RevealBuffer();
    buf.setTarget(thai);
    expect(buf.advance(1)).toBe(true);
    const partial = buf.visible();
    expect(thai.startsWith(partial)).toBe(true);
    expect(partial.length).toBeGreaterThan(0);
    expect(segs[0]).toBe(partial);
  });

  it("reveals incrementally and flushes to full text", () => {
    const buf = new RevealBuffer();
    buf.setTarget("Hello");
    expect(buf.visible()).toBe("");
    expect(buf.advance(2)).toBe(true);
    expect(buf.visible()).toBe("He");
    buf.flush();
    expect(buf.visible()).toBe("Hello");
    expect(buf.caughtUp()).toBe(true);
  });

  it("scales step size with backlog", () => {
    expect(revealStepSize(2)).toBe(1);
    expect(revealStepSize(50)).toBe(6);
    expect(revealStepSize(200)).toBe(12);
  });

  it("keeps markdown stable inside an open code fence", () => {
    const open = "Intro\n\n```ts\nconst x = 1;\n";
    expect(markdownStablePrefix(open)).toBe("Intro\n\n");
    const closed = "Intro\n\n```ts\nconst x = 1;\n```\n\nDone";
    expect(markdownStablePrefix(closed)).toBe(closed);
  });
});
