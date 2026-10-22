import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeDetected, SLUG_PATTERN, suggestName } from "@/components/projects/new-project";
import { lineClass, nearBottom, pollDelay } from "@/components/deploy/deployment-detail";
import { safeWorkerName } from "@/lib/connections/policy";

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("new project form", () => {
  it("suggested names trim dashes and match the server rule and the input pattern", () => {
    const re = new RegExp(`^(?:${SLUG_PATTERN})$`, "v");
    for (const raw of ["-My_Repo-", "__x__", "Hello.World", "a".repeat(80), "--a--b--"]) {
      const n = suggestName(raw);
      expect(n).toBe(safeWorkerName(raw));
      expect(n.startsWith("-") || n.endsWith("-")).toBe(false);
      expect(re.test(n)).toBe(true);
    }
    expect(re.test("-bad")).toBe(false);
    expect(re.test("bad-")).toBe(false);
  });

  it("re-inspect keeps fields the user edited", () => {
    expect(mergeDetected({ install: "pnpm i", build: "", output: "" }, { install: true }, { install: "npm ci", build: "npm run build", output: "dist" })).toEqual({ install: "pnpm i", build: "npm run build", output: "dist" });
  });

  it("keeps the form during re-inspect, resets root on branch change, hints on hasMore, titles rows", () => {
    const s = src("src/components/projects/new-project.tsx");
    expect(s).toContain('const reset = () => { setErr(""); setInspecting(true); };');
    expect(s).not.toMatch(/setInfo\(null\)/);
    expect(s).toContain('setRoot(""); setBranch(e.target.value)');
    expect(s).toMatch(/Refine your search/);
    expect(s).toContain("title={r.fullName}");
    expect(s).not.toContain('r.body.code === "reauth" ? `');
  });
});

describe("deployment detail", () => {
  it("backs off polling on errors and only sticks to the bottom near the end", () => {
    expect([0, 1, 2, 3, 10].map(pollDelay)).toEqual([2000, 4000, 8000, 16000, 30000]);
    expect(nearBottom({ scrollTop: 960, clientHeight: 0, scrollHeight: 1000 })).toBe(true);
    expect(nearBottom({ scrollTop: 900, clientHeight: 0, scrollHeight: 1000 })).toBe(false);
    expect(lineClass("error")).toMatch(/danger/);
    expect(lineClass("warn")).toMatch(/warning/);
    expect(lineClass("info")).not.toMatch(/danger|warning/);
    const s = src("src/components/deploy/deployment-detail.tsx");
    expect(s).not.toMatch(/<pre ref=\{logBox\} aria-live/);
    expect(s).toMatch(/<span aria-live="polite" aria-atomic="true"><StatusPill/);
    expect(s).toMatch(/Reconnecting/);
  });
});
