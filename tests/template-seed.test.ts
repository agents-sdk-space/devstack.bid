import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/data/templates";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import { validateChangeSet } from "@/lib/connections/policy";
import { templateSeedFiles } from "@/lib/projects/template-seed";

const sig = (id: string) => JSON.stringify(templateSeedFiles(id, "demo").filter((f) => f.path !== "README.md" && f.path !== "setup.sh"));

describe("templateSeedFiles (/new → Start from a template)", () => {
  it("covers every known template with its own starter files", () => {
    for (const id of KNOWN_TEMPLATE_IDS) {
      const files = templateSeedFiles(id, "demo");
      const paths = files.map((f) => f.path);
      expect(paths, id).toContain("setup.sh");
      expect(paths, id).toContain("README.md");
      expect(files.length, id).toBeGreaterThan(2);
      expect(validateChangeSet(files).ok, id).toBe(true);
      expect(paths.some((p) => /(^|\/)\.env(\.local)?$/.test(p)), id).toBe(false);
    }
  });
  it("yields distinct output per template (no shared default)", () => {
    const sigs = TEMPLATES.map((t) => sig(t.id));
    expect(new Set(sigs).size).toBe(TEMPLATES.length);
    const scripts = TEMPLATES.map((t) => templateSeedFiles(t.id, "demo").find((f) => f.path === "setup.sh")!.content);
    expect(new Set(scripts).size).toBe(TEMPLATES.length);
  });
  it("never falls back to the first template for an unknown id", () => {
    expect(templateSeedFiles("nope", "demo")).toEqual([]);
  });
});
