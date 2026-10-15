import { describe, expect, it } from "vitest";
import { audit, isAllowed, render } from "../scripts/third-party-licenses.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("third-party license policy", () => {
  it("evaluates SPDX expressions (OR = any allowed, AND = all allowed)", () => {
    expect(isAllowed("MIT", "x")).toBe(true);
    expect(isAllowed("(MIT OR GPL-3.0-or-later)", "x")).toBe(true);
    expect(isAllowed("(MIT AND Zlib)", "x")).toBe(true);
    expect(isAllowed("(MIT AND GPL-3.0-only)", "x")).toBe(false);
    expect(isAllowed("GPL-3.0-only", "x")).toBe(false);
    expect(isAllowed("LGPL-3.0-or-later", "x")).toBe(false);
    expect(isAllowed("BUSL-1.1", "x")).toBe(false);
    expect(isAllowed("SEE LICENSE IN LICENSE.md", "x")).toBe(false);
    expect(isAllowed("UNKNOWN", "x")).toBe(false);
    expect(isAllowed("CC-BY-4.0", "caniuse-lite")).toBe(true);
    expect(isAllowed("CC-BY-4.0", "other")).toBe(false);
    // Owner-approved 2026-10-15: only nodebox may use its Sustainable Use License.
    expect(isAllowed("SEE LICENSE IN ./LICENSE", "@codesandbox/nodebox")).toBe(true);
    expect(isAllowed("SEE LICENSE IN ./LICENSE", "other")).toBe(false);
  });

  it("every production dependency of the site and the Studio is allowed", () => {
    const result = audit();
    expect(result.flagged).toEqual([]);
    const names = (result.sets as [string, { name: string }[]][]).flatMap(([, pkgs]) => pkgs.map((p) => p.name));
    expect(names).not.toContain("@webcontainer/api");
    expect(names).toContain("sucrase");
  });

  it("THIRD_PARTY_LICENSES.md is up to date (npm run licenses)", () => {
    expect(readFileSync(join(process.cwd(), "THIRD_PARTY_LICENSES.md"), "utf8")).toBe(render(audit()));
  });
});
