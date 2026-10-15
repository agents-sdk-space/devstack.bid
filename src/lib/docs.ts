/**
 * In-app docs data (/docs). Everything comes from src/generated/docs-bundle.json, which
 * scripts/build-docs.mjs compiles from docs/**\/*.md at build time — Workers have no fs at runtime.
 * Import this from Server Components and route handlers only (the bundle is ~1 MB).
 */
import bundle from "@/generated/docs-bundle.json";
import nav from "@/generated/docs-nav.json";

export interface TocItem {
  depth: number;
  id: string;
  text: string;
}
export interface DocPage {
  slug: string;
  file: string;
  section: string;
  title: string;
  navTitle: string;
  description: string;
  raw: string;
  html: string;
  toc: TocItem[];
}
export type DocsNav = typeof nav;

export const DOCS: DocPage[] = bundle.docs as DocPage[];
export const DOCS_NAV: DocsNav = nav;
export const DOC_EXTRAS: { path: string; raw: string }[] = bundle.extras;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://devstack.bid").replace(/\/+$/, "");

/** NEXT_PUBLIC_REPO_URL, only if it is a valid https URL. Enables "Edit on GitHub". */
export function repoUrl(value = process.env.NEXT_PUBLIC_REPO_URL): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

export const pagePath = (slug: string) => (slug ? `/docs/${slug}` : "/docs");
/** Raw Markdown URL: /docs/<slug>.md (landing page: /docs/index.md). */
export const rawPath = (slug: string) => `/docs/${slug || "index"}.md`;

export function getDoc(slug: string): DocPage | undefined {
  return DOCS.find((d) => d.slug === slug);
}

/** Resolves a raw path segment list ("index" = landing; ".md" suffix optional) to a page. */
export function getDocByRawSlug(parts: string[]): DocPage | undefined {
  const slug = parts.join("/").replace(/\.md$/i, "").toLowerCase();
  return getDoc(slug === "index" ? "" : slug);
}

export function sectionOf(doc: DocPage) {
  return DOCS_NAV.sections.find((s) => s.id === doc.section);
}

export function prevNext(slug: string): { prev?: DocPage; next?: DocPage } {
  const i = DOCS.findIndex((d) => d.slug === slug);
  return { prev: i > 0 ? DOCS[i - 1] : undefined, next: i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : undefined };
}

export const MARKDOWN_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=3600",
  "Access-Control-Allow-Origin": "*",
} as const;

/** /llms.txt (https://llmstxt.org): an index of every doc's raw Markdown URL for AI agents. */
export function llmsTxt(site = SITE_URL): string {
  const lines = [
    "# DevStack — NVX Stack Builder",
    "",
    "> NVX Stack Builder (https://devstack.bid) turns npm, nvm, npx, pip and PyPI setup commands into ordered, de-duplicated, bilingual (Thai/English) Stack Templates that people review and run themselves. The server never executes commands.",
    "",
    "Apps on the site: Stack Builder (/templates, /builder), User Chat (/chat, Workers AI + Hugging Face), Dev Chat (/chat/dev, OpenAI Orchestrator agent with a hosted sandbox), Sandbox Factory (/factory, bring your own OpenAI key) and Studio (/studio/, beta: AI agents build a full-stack app in the browser with a static in-browser preview (Sucrase, sandboxed iframe), PGlite + pgvector and one-click export; code runs only in the visitor's browser).",
    "",
    "## When to use DevStack (agents)",
    "",
    "- Compose or export **setup scripts** from templates (`/builder`, MCP `compose_stack`, `/api/plan`) when the user needs ordered npm/pip commands — not when they need a hosted runtime.",
    "- **Search documentation** via MCP `search_docs` or the raw Markdown URLs below before guessing DevStack behavior.",
    "- Use **MCP** (`/mcp`, discovery `/.well-known/mcp`) for tool-based integration; mint scoped Bearer keys at `/settings/mcp`. HTTP surface: `/openapi.json`.",
    "- Use **User Chat** (`/chat`) for free-tier Q&A; **Dev Chat** (`/chat/dev`) or **Factory** for sandbox agents — never expect DevStack to execute shell commands server-side.",
    "",
    `Agent instructions: ${site}/agent-instructions.txt`,
    "",
    "Every page below is the exact Markdown source from the repository's docs/ folder (text/markdown, UTF-8). Docs are written in Thai with English technical terms. The rendered page is the same URL without `.md`.",
    "",
  ];
  for (const s of DOCS_NAV.sections) {
    if (!s.pages.length) continue;
    lines.push(`## ${s.label.en} (${s.label.th})`, "");
    for (const p of s.pages) {
      const doc = getDoc(p.slug)!;
      lines.push(`- [${doc.title.replace(/[[\]]/g, "")}](${site}${rawPath(doc.slug)})${doc.description ? `: ${doc.description}` : ""}`);
    }
    lines.push("");
  }
  lines.push("## Optional", "");
  const extraNote: Record<string, string> = {
    "agents/platform-manifest.json": "machine-readable platform map (JSON)",
    "agents/cursor-agents.json": "NVX DEVELOPER BOTH agent roster (JSON)",
  };
  for (const e of DOC_EXTRAS) lines.push(`- [${e.path}](${site}/docs/${e.path}): ${extraNote[e.path] ?? "machine-readable JSON"}`);
  lines.push(`- [llms-full.txt](${site}/llms-full.txt): every page above concatenated into one file`, "");
  return lines.join("\n");
}

export function llmsFullTxt(site = SITE_URL): string {
  return DOCS.map((d) => `<!-- source: ${d.file} · ${site}${rawPath(d.slug)} -->\n\n${d.raw.trimEnd()}\n`).join("\n\n---\n\n");
}
