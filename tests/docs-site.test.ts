import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../next.config";
import { buildDocsBundle, SECTIONS } from "../scripts/build-docs.mjs";
import { DOC_EXTRAS, DOCS, DOCS_NAV, getDoc, getDocByRawSlug, llmsTxt, pagePath, rawPath, repoUrl } from "@/lib/docs";
import { normalize, searchDocs, type SearchEntry } from "@/lib/docs-search";
import { GET as rawGET, generateStaticParams as rawParams } from "@/app/docs/raw/[...slug]/route";
import { generateStaticParams as pageParams } from "@/app/docs/[...slug]/page";
import searchIndex from "../public/docs-search-index.json";

const root = path.resolve(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "dist") walk(p, out);
    } else if (e.name.endsWith(".md")) out.push(path.relative(root, p).split(path.sep).join("/"));
  }
  return out;
}
const mdFiles = walk(path.join(root, "docs")).sort();

describe("docs bundle", () => {
  it("includes every docs/**/*.md with its exact raw source", () => {
    expect(DOCS.map((d) => d.file).sort()).toEqual(mdFiles);
    for (const d of DOCS) expect(d.raw).toBe(fs.readFileSync(path.join(root, d.file), "utf8"));
  });

  it("has unique slugs, a landing page and a title for every page", () => {
    const slugs = DOCS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(getDoc("")?.file).toBe("docs/README.md");
    for (const d of DOCS) expect(d.title.length).toBeGreaterThan(2);
  });

  it("puts every page in the drawer under the required sections", () => {
    const ids = DOCS_NAV.sections.map((s) => s.id);
    for (const s of ["user-guide", "concepts", "architecture", "history", "operations", "contributing", "reference", "agents"]) expect(ids).toContain(s);
    const navSlugs = DOCS_NAV.sections.flatMap((s) => s.pages.map((p) => p.slug)).sort();
    expect(navSlugs).toEqual(DOCS.map((d) => d.slug).sort());
    expect(SECTIONS.length).toBe(DOCS_NAV.sections.length);
  });

  it("rewrites links between docs to /docs URLs and keeps anchors", () => {
    const home = getDoc("")!;
    expect(home.html).toContain('href="/docs/user-guide/getting-started"');
    expect(home.html).not.toMatch(/href="[^"]*\.md"/);
    expect(getDoc("user-guide/builder")!.toc.length).toBeGreaterThan(2);
  });

  it("adds a copy button to every code block and pre-rendered SVG for Mermaid", () => {
    const d = getDoc("user-guide/downloads")!;
    const blocks = (d.raw.match(/^```/gm) ?? []).length / 2;
    expect((d.html.match(/data-copy-code/g) ?? []).length).toBe(blocks);
    const overview = getDoc("architecture/overview")!;
    const svg = /src="(\/docs-assets\/diagrams\/[0-9a-f]{16}\.svg)"/.exec(overview.html);
    expect(svg).not.toBeNull();
    expect(fs.existsSync(path.join(root, "public", svg![1]))).toBe(true);
  });

  it("sanitizes untrusted Markdown (raw HTML, javascript: links, event handlers)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvx-docs-"));
    fs.mkdirSync(path.join(tmp, "docs"));
    fs.writeFileSync(
      path.join(tmp, "docs/README.md"),
      '# Evil\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[click](javascript:alert(3))\n\n<iframe src="https://example.com"></iframe>\n'
    );
    const { bundle } = buildDocsBundle(tmp, { repoUrl: null });
    const html: string = bundle.docs[0].html;
    expect(html).not.toMatch(/<script|onerror|javascript:|<iframe/i);
    expect(bundle.docs[0].raw).toContain("<script>"); // raw stays the exact source
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("raw Markdown route", () => {
  it("returns the exact source as text/markdown", async () => {
    const res = await rawGET(new Request("http://x/docs/raw/user-guide/getting-started"), { params: Promise.resolve({ slug: ["user-guide", "getting-started"] }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(fs.readFileSync(path.join(root, "docs/user-guide/getting-started.md"), "utf8"));
  });

  it("serves the landing page as index and 404s unknown slugs", async () => {
    const idx = await rawGET(new Request("http://x"), { params: Promise.resolve({ slug: ["index"] }) });
    expect(await idx.text()).toBe(fs.readFileSync(path.join(root, "docs/README.md"), "utf8"));
    const missing = await rawGET(new Request("http://x"), { params: Promise.resolve({ slug: ["nope"] }) });
    expect(missing.status).toBe(404);
    expect(getDocByRawSlug(["DEPLOY.md"])?.file).toBe("docs/DEPLOY.md");
  });

  it("prerenders a raw URL and a page for every doc", () => {
    expect(rawParams().length).toBe(DOCS.length + DOC_EXTRAS.length);
    expect(pageParams().length).toBe(DOCS.length - 1); // landing is /docs
  });
});

describe("next.config rewrites for docs", () => {
  const rewrites = nextConfig.rewrites!;
  async function resolve(pathname: string) {
    const r = (await (rewrites as () => Promise<{ beforeFiles: { source: string; destination: string }[] }>)()).beforeFiles;
    for (const rule of r) {
      const params = getPathMatch(rule.source)(pathname);
      if (params) return rule.destination.replace(/:(\w+)/g, (_, k) => String(params[k]));
    }
    return pathname;
  }
  it("maps .md URLs to the raw route", async () => {
    expect(await resolve("/docs/user-guide/builder.md")).toBe("/docs/raw/user-guide/builder");
    expect(await resolve("/docs.md")).toBe("/docs/raw/index");
  });
  it("leaves known pages alone and sends unknown slugs to the 404 page", async () => {
    expect(await resolve("/docs/user-guide/builder")).toBe("/docs/user-guide/builder");
    expect(await resolve("/docs/deploy")).toBe("/docs/deploy");
    expect(await resolve("/docs/platform")).toBe("/docs/platform");
    expect(await resolve("/docs/agents/cursor-caretakers")).toBe("/docs/agents/cursor-caretakers");
    expect(await resolve("/docs/agents/platform-manifest.json")).toBe("/docs/raw/agents/platform-manifest.json");
    expect(await resolve("/docs/agents/cursor-agents.json")).toBe("/docs/raw/agents/cursor-agents.json");
    expect(await resolve("/docs/user-guide/nope")).toBe("/__nvx_not_found");
    expect(await resolve("/docs/raw/user-guide/builder")).toBe("/docs/raw/user-guide/builder");
  });
});

describe("llms.txt", () => {
  it("lists every raw docs URL", () => {
    const txt = llmsTxt("https://devstack.bid");
    for (const d of DOCS) expect(txt).toContain(`https://devstack.bid${rawPath(d.slug)}`);
    expect(txt.startsWith("# DevStack")).toBe(true);
  });
});

describe("docs helpers", () => {
  it("builds paths and validates the repo URL", () => {
    expect(pagePath("")).toBe("/docs");
    expect(rawPath("")).toBe("/docs/index.md");
    expect(repoUrl("https://github.com/o/r/")).toBe("https://github.com/o/r");
    expect(repoUrl("javascript:alert(1)")).toBeNull();
    expect(repoUrl("")).toBeNull();
  });
});

describe("docs search", () => {
  const entries = searchIndex as SearchEntry[];
  it("finds Thai words inside unsegmented Thai text", () => {
    const hits = searchDocs(entries, "ดาวน์โหลด");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.slug === "user-guide/downloads")).toBe(true);
  });
  it("matches all terms (AND), case-insensitively", () => {
    const hits = searchDocs(entries, "RATE limit");
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(normalize(`${h.title} ${h.heading} ${h.text}`)).toContain("rate");
    expect(searchDocs(entries, "zzzz-not-a-word")).toEqual([]);
    expect(searchDocs(entries, "   ")).toEqual([]);
  });
});
