import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
const t = (k: "nav.newProject", l: "en" | "th") => translate(l, k);

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("/new entry points", () => {
  it("has a bilingual label without emoji", () => {
    expect(t("nav.newProject", "en")).toBe("New Project");
    expect(t("nav.newProject", "th")).toBe("สร้างโปรเจกต์ใหม่");
    expect(/\p{Extended_Pictographic}/u.test(t("nav.newProject", "th") + t("nav.newProject", "en"))).toBe(false);
  });

  it("desktop header has a primary New Project button; the mobile sheet has one button and no duplicate list item", () => {
    const h = src("src/components/header.tsx");
    const primary = h.slice(h.indexOf("export const PRIMARY"), h.indexOf("];", h.indexOf("export const PRIMARY")));
    expect(primary).not.toContain("/new");
    const nav = h.slice(h.indexOf("export const NAV"), h.indexOf("] as const;"));
    expect(nav).not.toContain('"/new"');
    expect(h).toMatch(/<Link href="\/new" data-testid="header-new-project"[^>]*buttonClasses\("primary", "sm"\)/);
    expect(h.match(/<Link href="\/new" onClick=\{\(\) => setMenuOpen\(false\)\}/g)).toHaveLength(1);
  });

  it("/projects has a header button and an empty-state button to /new", () => {
    const p = src("src/components/projects/projects-list.tsx");
    expect(p).toMatch(/href="\/new" data-testid="projects-new"/);
    expect(p).toMatch(/href="\/new" data-testid="projects-empty-new"/);
  });
});
