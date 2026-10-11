#!/usr/bin/env node
/**
 * docs:bundle — compiles docs/**\/*.md into static modules for the in-app docs (/docs).
 *
 * Cloudflare Workers have no filesystem at runtime, so this runs at BUILD time (npm `prebuild`,
 * `predev`, `pretest`, `pretypecheck`) and writes:
 *   src/generated/docs-bundle.json   every page: exact raw Markdown + sanitized HTML + TOC
 *   src/generated/docs-nav.json      light nav list (sections, titles, slugs) for client components
 *   public/docs-search-index.json    per-section plain text for client-side search (fetched lazily)
 * All three are gitignored and regenerated on every build, so they never drift from docs/.
 *
 * Pipeline: remark-parse → remark-gfm → remark-rehype (raw HTML dropped) → rehype-sanitize →
 * rehype-slug → then trusted, post-sanitize transforms: link rewriting, heading anchors, code
 * highlighting (lowlight), code-block toolbar, table wrapper, Mermaid → pre-rendered SVG.
 *
 * Mermaid: diagrams are rendered once with `npm run docs:diagrams` into
 * public/docs-assets/diagrams/<sha>.svg (committed). A block without a matching SVG stays a code
 * block, so the build never needs a browser.
 *
 * Env: NEXT_PUBLIC_REPO_URL (optional, https://github.com/<owner>/<repo>) turns links to repo
 * files (src/…, README.md) into GitHub links; without it they render as plain text.
 * Usage: node scripts/build-docs.mjs [--check]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toString as hastToString } from "hast-util-to-string";
import { common, createLowlight } from "lowlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit, SKIP } from "unist-util-visit";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Section order for the navigation drawer. `files` fixes the reading order; unknown files go last. */
export const SECTIONS = [
  { id: "start", label: { th: "เริ่มต้นที่นี่", en: "Start here" }, files: ["README.md"] },
  {
    id: "user-guide",
    label: { th: "คู่มือผู้ใช้", en: "User guide" },
    files: ["getting-started", "templates", "builder", "ai-agent", "sharing", "downloads", "language-theme", "troubleshooting"].map((f) => `user-guide/${f}.md`),
  },
  { id: "concepts", label: { th: "แนวคิด", en: "Concepts" }, files: ["stack-template", "composition", "safety-model", "design-system"].map((f) => `concepts/${f}.md`) },
  {
    id: "architecture",
    label: { th: "สถาปัตยกรรม", en: "Architecture" },
    files: [
      ...["overview", "data-flow", "templates-and-composer", "scripts-and-share", "ai-planner", "api-hardening", "ui-framework", "cloudflare-runtime", "docs-site"].map((f) => `architecture/${f}.md`),
      "UI-FRAMEWORK.md",
    ],
  },
  { id: "history", label: { th: "ประวัติ", en: "History" }, files: ["history/SUBSYSTEM-HISTORY.md"] },
  {
    id: "operations",
    label: { th: "การดูแลระบบ", en: "Operations" },
    files: [...["local-dev", "env-secrets", "deploy-cloudflare", "rollback", "monitoring", "rate-limits-cost", "custom-domain"].map((f) => `operations/${f}.md`), "DEPLOY.md"],
  },
  {
    id: "contributing",
    label: { th: "ร่วมพัฒนา", en: "Contributing" },
    files: ["add-template", "add-component", "testing", "release-process", "docs-maintenance"].map((f) => `contributing/${f}.md`),
  },
  { id: "reference", label: { th: "อ้างอิง", en: "Reference" }, files: ["api-plan", "template-schema", "config-env", "npm-scripts", "file-map"].map((f) => `reference/${f}.md`) },
  { id: "agents", label: { th: "สำหรับ AI agent", en: "For AI agents" }, files: ["agents/AGENT-PLAYBOOK.md"] },
];

/** Extra non-Markdown files under docs/ that are served raw too (linked from the Markdown). */
export const RAW_EXTRAS = ["agents/platform-manifest.json"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "dist") walk(p, out);
    } else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** docs-relative file → URL slug ("" for the landing page). */
export function slugForFile(file) {
  if (file === "README.md") return "";
  return file.replace(/\.md$/, "").toLowerCase();
}

/** Raw URL path for a slug: /docs/<slug>.md, landing = /docs/index.md */
export const rawPath = (slug) => `/docs/${slug || "index"}.md`;
export const pagePath = (slug) => (slug ? `/docs/${slug}` : "/docs");

function navTitle(title) {
  let t = title.replace(/`/g, "").replace(/^Subsystem:\s*/i, "");
  t = t.split(" · ")[0];
  t = t.split(" — ")[0];
  return t.trim();
}

function firstParagraph(tree) {
  let text = "";
  visit(tree, "element", (node) => {
    if (text) return SKIP;
    if (node.tagName === "p") {
      text = hastToString(node).replace(/\s+/g, " ").trim();
      return SKIP;
    }
  });
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text;
}

const el = (tagName, properties = {}, children = []) => ({ type: "element", tagName, properties, children });
const txt = (value) => ({ type: "text", value });

export const diagramHash = (source) => crypto.createHash("sha256").update(source.trim()).digest("hex").slice(0, 16);

// Sanitizer: GitHub-style defaults, plus no "user-content-" id prefix (ids are added after
// sanitizing by rehype-slug, from heading text only) and language-* classes on code.
const schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: { ...defaultSchema.attributes, code: [["className", /^language-[\w-]+$/]] },
};

function safeRepoUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.href.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

/** Post-sanitize transforms. Only rewrites the sanitized tree, never adds untrusted markup. */
function docsTransforms({ file, fileSet, repoUrl, diagramsDir, stats }) {
  const lowlight = createLowlight(common);
  const dir = path.posix.dirname(`docs/${file}`);
  return () => (tree) => {
    visit(tree, "element", (node, index, parent) => {
      // 1. Links: docs pages → /docs/<slug>, other repo files → GitHub (or plain text).
      if (node.tagName === "a" && typeof node.properties.href === "string") {
        const href = node.properties.href;
        if (/^https?:\/\//i.test(href)) {
          node.properties.rel = ["noopener", "noreferrer"];
          if (!/^https?:\/\/(www\.)?devstack\.bid(\/|$)/i.test(href)) node.properties.target = "_blank";
        } else if (!href.startsWith("#") && !href.startsWith("/") && !/^[a-z]+:/i.test(href)) {
          const [p, hash] = href.split("#");
          const target = path.posix.normalize(path.posix.join(dir, decodeURIComponent(p)));
          const docRel = target.startsWith("docs/") ? target.slice(5) : null;
          if (docRel && fileSet.has(docRel)) {
            node.properties.href = pagePath(slugForFile(docRel)) + (hash ? `#${hash}` : "");
          } else if (docRel && RAW_EXTRAS.includes(docRel)) {
            node.properties.href = `/docs/${docRel}`;
          } else if (repoUrl && !target.startsWith("..")) {
            node.properties.href = `${repoUrl}/blob/main/${target}`;
            node.properties.rel = ["noopener", "noreferrer"];
            node.properties.target = "_blank";
          } else if (parent && typeof index === "number") {
            stats.repoRefs++;
            parent.children[index] = el("span", { className: ["docs-repo-ref"], title: target }, node.children);
            return SKIP;
          }
        }
      }
      // 2. Heading anchors (h2–h4).
      if (/^h[2-4]$/.test(node.tagName) && node.properties.id) {
        node.children.push(el("a", { className: ["docs-anchor"], href: `#${node.properties.id}`, ariaLabel: "Link to this section" }, [txt("#")]));
      }
      // 3. Tables scroll horizontally on small screens.
      if (node.tagName === "table" && parent && typeof index === "number" && !(parent.properties?.className ?? []).includes("docs-table")) {
        // No SKIP: the visitor continues into the wrapper, so links inside tables are rewritten too.
        parent.children[index] = el("div", { className: ["docs-table"], tabIndex: 0, role: "region", ariaLabel: "Table" }, [node]);
      }
      // 4. Code blocks: highlighting + toolbar with a copy button; Mermaid → SVG.
      if (node.tagName === "pre" && parent && typeof index === "number") {
        const code = node.children.find((c) => c.type === "element" && c.tagName === "code");
        if (!code) return;
        const cls = (code.properties.className ?? []).find((c) => String(c).startsWith("language-"));
        const lang = cls ? String(cls).slice(9) : "";
        const source = hastToString(code);
        if (lang === "mermaid") {
          const hash = diagramHash(source);
          stats.mermaid.push({ hash, file, source });
          const svgFile = path.join(diagramsDir, `${hash}.svg`);
          if (fs.existsSync(svgFile)) {
            // Wide diagrams keep a readable size and scroll horizontally instead of shrinking to fit.
            const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(fs.readFileSync(svgFile, "utf8").slice(0, 2000));
            const [w, h] = vb ? [Math.round(Number(vb[1])), Math.round(Number(vb[2]))] : [800, 400];
            const src = `/docs-assets/diagrams/${hash}.svg`;
            parent.children[index] = el("figure", { className: ["docs-diagram"] }, [
              el("div", { className: ["docs-diagram-scroll"], tabIndex: 0, role: "region", ariaLabel: "Diagram" }, [
                el("a", { href: src, target: "_blank", rel: ["noopener"], title: "Open full size" }, [
                  el("img", { src, width: w, height: h, style: `width:max(100%, ${Math.min(Math.round(w * 0.72), 1100)}px)`, alt: "Mermaid diagram (source below)", loading: "lazy", decoding: "async" }),
                ]),
              ]),
              el("details", {}, [el("summary", {}, [txt("Mermaid source")]), el("pre", {}, [el("code", { className: ["language-mermaid"] }, [txt(source)])])]),
            ]);
            return SKIP;
          }
        }
        const label = { sh: "bash", shell: "bash", jsonc: "json" }[lang] ?? lang;
        if (label && lowlight.registered(label)) {
          const result = lowlight.highlight(label, source.replace(/\n$/, ""));
          code.children = result.children;
          code.properties.className = ["hljs", `language-${lang}`];
        } else {
          code.properties.className = ["hljs", ...(lang ? [`language-${lang}`] : [])];
        }
        stats.codeBlocks++;
        parent.children[index] = el("div", { className: ["docs-code"], dataLang: lang || "text" }, [
          el("div", { className: ["docs-code-bar"] }, [
            el("span", { className: ["docs-code-lang"] }, [txt(lang || "text")]),
            el("button", { type: "button", className: ["docs-copy"], dataCopyCode: "" }, [txt("Copy")]),
          ]),
          node,
        ]);
        return SKIP;
      }
    });
  };
}

function tocAndSections(tree, title) {
  const toc = [];
  const sections = [{ id: "", heading: title, text: [] }];
  for (const node of tree.children) {
    if (node.type !== "element") continue;
    const m = /^h([1-4])$/.exec(node.tagName);
    if (m && m[1] !== "1") {
      const text = hastToString(node).replace(/#$/, "").trim();
      if (m[1] === "2" || m[1] === "3") toc.push({ depth: Number(m[1]), id: node.properties.id, text });
      sections.push({ id: node.properties.id, heading: text, text: [] });
    } else if (!m) {
      sections.at(-1).text.push(hastToString(node));
    }
  }
  return {
    toc,
    sections: sections
      .map((s) => ({ id: s.id, heading: s.heading, text: s.text.join(" ").replace(/\s+/g, " ").replace(/\bCopy\b/g, "").trim() }))
      .filter((s) => s.text || s.id),
  };
}

export function buildDocsBundle(root = ROOT, { repoUrl = safeRepoUrl(process.env.NEXT_PUBLIC_REPO_URL) } = {}) {
  const docsDir = path.join(root, "docs");
  const diagramsDir = path.join(root, "public/docs-assets/diagrams");
  const files = walk(docsDir).map((p) => path.relative(docsDir, p).split(path.sep).join("/"));
  const fileSet = new Set(files);
  const ordered = [];
  const seen = new Set();
  for (const s of SECTIONS) {
    for (const f of s.files) if (fileSet.has(f)) { ordered.push({ file: f, section: s.id }); seen.add(f); }
    for (const f of files.filter((x) => !seen.has(x) && x.startsWith(`${s.id}/`)).sort()) { ordered.push({ file: f, section: s.id }); seen.add(f); }
  }
  for (const f of files.filter((x) => !seen.has(x)).sort()) ordered.push({ file: f, section: "start" });

  const stats = { codeBlocks: 0, repoRefs: 0, mermaid: [] };
  const docs = [];
  const search = [];
  for (const { file, section } of ordered) {
    const raw = fs.readFileSync(path.join(docsDir, file), "utf8");
    const slug = slugForFile(file);
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize, schema)
      .use(rehypeSlug)
      .use(docsTransforms({ file, fileSet, repoUrl, diagramsDir, stats }));
    const hast = processor.runSync(processor.parse(raw));
    // The H1 becomes the page title and is dropped from the body (the page renders its own header).
    const firstH1 = hast.children.findIndex((n) => n.type === "element" && n.tagName === "h1");
    const title = firstH1 >= 0 ? hastToString(hast.children[firstH1]).trim() : slug || "Docs";
    if (firstH1 >= 0) hast.children.splice(firstH1, 1);
    const { toc, sections } = tocAndSections(hast, title);
    const html = unified().use(rehypeStringify).stringify(hast);
    docs.push({ slug, file: `docs/${file}`, section, title, navTitle: navTitle(title), description: firstParagraph(hast), raw, html, toc });
    for (const s of sections) search.push({ slug, title: navTitle(title), id: s.id, heading: s.heading, text: s.text.slice(0, 4000) });
  }

  const nav = {
    sections: SECTIONS.map(({ id, label }) => ({ id, label, pages: docs.filter((d) => d.section === id).map(({ slug, title, navTitle: n }) => ({ slug, title, navTitle: n })) })),
  };
  const extras = RAW_EXTRAS.filter((f) => fileSet.has(f) || fs.existsSync(path.join(docsDir, f))).map((f) => ({ path: f, raw: fs.readFileSync(path.join(docsDir, f), "utf8") }));
  return { bundle: { repoUrl, docs, extras }, nav, search, stats };
}

export function writeDocsBundle(root = ROOT) {
  const { bundle, nav, search, stats } = buildDocsBundle(root);
  const genDir = path.join(root, "src/generated");
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(path.join(genDir, "docs-bundle.json"), JSON.stringify(bundle));
  fs.writeFileSync(path.join(genDir, "docs-nav.json"), JSON.stringify(nav, null, 1));
  fs.writeFileSync(path.join(root, "public/docs-search-index.json"), JSON.stringify(search));
  return { bundle, stats, searchEntries: search.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { bundle, stats, searchEntries } = writeDocsBundle();
  const missing = stats.mermaid.filter((m) => !fs.existsSync(path.join(ROOT, "public/docs-assets/diagrams", `${m.hash}.svg`)));
  console.log(
    `docs:bundle wrote ${bundle.docs.length} pages, ${searchEntries} search sections, ${stats.codeBlocks} code blocks, ${stats.mermaid.length} diagrams` +
      (missing.length ? ` (${missing.length} without SVG: run npm run docs:diagrams)` : "")
  );
  if (process.argv.includes("--check") && missing.length) process.exit(1);
}
