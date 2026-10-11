#!/usr/bin/env node
/**
 * docs:pdf — renders the user guide (docs/user-guide/*.md) to docs/dist/NVX-User-Guide.pdf.
 * Uses a tiny built-in Markdown converter (headings, lists, tables, code, quotes, inline marks)
 * and Playwright Chromium to print. Playwright is NOT a project dependency: install it anywhere
 * and point PLAYWRIGHT_DIR at the folder that contains node_modules/playwright, e.g.
 *   PLAYWRIGHT_DIR=/tmp/pw npm run docs:pdf
 * Thai text needs a Thai system font (Sarabun / Noto Sans Thai / IBM Plex Sans Thai); verify with
 *   pdffonts docs/dist/NVX-User-Guide.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDER = ["getting-started", "templates", "builder", "ai-agent", "sharing", "downloads", "language-theme", "troubleshooting"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => (/^https?:/.test(u) ? `<a href="${u}">${t}</a>` : `<span class="xref">${t}</span>`));
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

export function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^```(\w*)/);
    if (fence) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) buf.push(lines[i]);
      i++;
      out.push(fence[1] === "mermaid" ? `<p class="note">(diagram: see the online docs)</p>` : `<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows = [];
      for (; i < lines.length && /^\|.*\|\s*$/.test(lines[i]); i++) rows.push(lines[i]);
      const cells = (r) => r.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, "|")));
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|$/.test(r.trim())));
      out.push(`<table><thead><tr>${cells(body[0]).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body
        .slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      for (; i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i])); i++) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "").replace(/^\[ \]\s*/, "☐ "));
        else items[items.length - 1] += " " + lines[i].trim();
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (l.startsWith(">")) {
      const buf = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) buf.push(lines[i].replace(/^>\s?/, ""));
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    if (/^(---|\*\*\*)\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|```|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i]); i++) buf.push(lines[i].trim());
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

function buildHtml() {
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const sections = ORDER.map((n) => path.join(root, "docs/user-guide", `${n}.md`))
    .filter(fs.existsSync)
    .map((f) => `<section>${mdToHtml(fs.readFileSync(f, "utf8"))}</section>`);
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>NVX Stack Builder — User Guide</title><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Sarabun", "IBM Plex Sans Thai", "Noto Sans Thai", "Noto Sans", sans-serif; font-size: 11pt; line-height: 1.6; color: #1d1d1f; }
  h1 { font-size: 20pt; border-bottom: 2px solid #0071e3; padding-bottom: 4px; } h2 { font-size: 15pt; margin-top: 18px; } h3 { font-size: 12.5pt; }
  section { break-before: page; } section:first-of-type { break-before: auto; }
  code, pre { font-family: "DejaVu Sans Mono", "Noto Sans Mono", monospace; font-size: 9pt; }
  code { background: #f2f2f4; padding: 0 3px; border-radius: 3px; }
  pre { background: #f5f5f7; border: 1px solid #ddd; padding: 8px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.5pt; } th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #f0f0f2; }
  blockquote { border-left: 3px solid #0071e3; margin: 8px 0; padding: 4px 10px; background: #f5f9ff; }
  .cover { text-align: center; padding-top: 80mm; } .cover h1 { border: none; font-size: 28pt; } .xref { color: #0066cc; } .note { color: #666; font-style: italic; }
  </style></head><body><div class="cover"><h1>NVX Stack Builder</h1><p>คู่มือผู้ใช้ · User Guide</p><p>v${version} · generated ${new Date().toISOString().slice(0, 10)}</p></div>
  ${sections.join("\n")}</body></html>`;
}

async function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, root, "/tmp/pw"].filter(Boolean);
  for (const d of dirs) {
    try {
      const req = createRequire(path.join(d, "package.json"));
      return await import(pathToFileURL(req.resolve("playwright")).href);
    } catch { /* try next */ }
  }
  throw new Error("Playwright not found. Install it (npm i playwright in some folder) and set PLAYWRIGHT_DIR.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outDir = path.join(root, "docs/dist");
  fs.mkdirSync(outDir, { recursive: true });
  const html = buildHtml();
  const htmlPath = path.join(outDir, "NVX-User-Guide.html");
  fs.writeFileSync(htmlPath, html);
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(() => document.fonts.ready);
  const pdf = path.join(outDir, "NVX-User-Guide.pdf");
  await page.pdf({ path: pdf, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">NVX Stack Builder · <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
  await browser.close();
  fs.rmSync(htmlPath);
  console.log(`wrote ${path.relative(root, pdf)}`);
}
