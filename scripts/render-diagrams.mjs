#!/usr/bin/env node
/**
 * docs:diagrams — pre-renders every ```mermaid block in docs/ to a static SVG for the in-app docs:
 *   public/docs-assets/diagrams/<sha256-16>.svg   (committed; the hash is of the diagram source)
 * The docs bundle (scripts/build-docs.mjs) swaps a Mermaid block for <img src=…svg> when the file
 * exists, so pages ship zero Mermaid JavaScript and need no CSP change. Re-run after editing a
 * diagram; stale SVGs are removed. Like docs:pdf, Playwright is not a project dependency:
 *   PLAYWRIGHT_DIR=/tmp/pw npm run docs:diagrams
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDocsBundle } from "./build-docs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/docs-assets/diagrams");

async function loadPlaywright() {
  for (const d of [process.env.PLAYWRIGHT_DIR, root, "/tmp/pw"].filter(Boolean)) {
    try {
      const req = createRequire(path.join(d, "package.json"));
      return await import(pathToFileURL(req.resolve("playwright")).href);
    } catch {
      /* try next */
    }
  }
  throw new Error("Playwright not found. Install it (npm i playwright in some folder) and set PLAYWRIGHT_DIR.");
}

const { stats } = buildDocsBundle(root);
const diagrams = [...new Map(stats.mermaid.map((m) => [m.hash, m])).values()];
fs.mkdirSync(outDir, { recursive: true });

const pw = await loadPlaywright();
const chromium = pw.chromium ?? pw.default?.chromium;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><meta charset=utf-8><body style='background:#000'></body>");
await page.addScriptTag({ path: path.join(root, "node_modules/mermaid/dist/mermaid.min.js") });
await page.evaluate(() => {
  // Black theme to match the docs; plain SVG text (no foreignObject) so the file works as an <img>.
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: "basis" },
    themeVariables: {
      darkMode: true,
      background: "#000000",
      fontFamily: "'IBM Plex Sans Thai', 'Noto Sans Thai', 'Leelawadee UI', Thonburi, 'Segoe UI', sans-serif",
      fontSize: "14px",
      primaryColor: "#1c1c1e",
      primaryTextColor: "#f5f5f7",
      primaryBorderColor: "#3a3a3c",
      secondaryColor: "#161617",
      tertiaryColor: "#0b0b0c",
      lineColor: "#8e8e93",
      textColor: "#f5f5f7",
      clusterBkg: "#0b0b0c",
      clusterBorder: "#3a3a3c",
      actorBkg: "#1c1c1e",
      actorBorder: "#2997ff",
      actorTextColor: "#f5f5f7",
      signalColor: "#c7c7cc",
      signalTextColor: "#f5f5f7",
      noteBkgColor: "#1d2a3a",
      noteTextColor: "#f5f5f7",
      noteBorderColor: "#2997ff",
      labelBoxBkgColor: "#1c1c1e",
      labelTextColor: "#f5f5f7",
      loopTextColor: "#f5f5f7",
      edgeLabelBackground: "#000000",
    },
  });
});

const keep = new Set();
for (const d of diagrams) {
  const svg = await page.evaluate(async ({ id, src }) => (await window.mermaid.render(id, src)).svg, { id: `d${d.hash}`, src: d.source });
  const out = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.replace(/<br>/g, "<br/>")}\n`;
  fs.writeFileSync(path.join(outDir, `${d.hash}.svg`), out);
  keep.add(`${d.hash}.svg`);
  console.log(`rendered ${d.hash}.svg  (${d.file}, ${out.length} bytes)`);
}
for (const f of fs.readdirSync(outDir)) if (f.endsWith(".svg") && !keep.has(f)) { fs.unlinkSync(path.join(outDir, f)); console.log(`removed stale ${f}`); }
await browser.close();
