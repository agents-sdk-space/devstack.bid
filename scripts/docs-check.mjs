#!/usr/bin/env node
/**
 * docs:check — keeps docs/ honest. Pure Node, no dependencies.
 * Rules (documented in docs/contributing/docs-maintenance.md):
 *  1. every docs/**\/*.md (except docs/dist) has >= MIN_CHARS content characters
 *  2. relative markdown links in docs/, README.md and AGENTS.md resolve
 *  3. backticked repo paths (src/, scripts/, tests/, docs/, public/) exist
 *  4. every template id appears in the template reference and user guide
 *  5. every env var / rate-limit / D1 / R2 binding appears in docs/reference/config-env.md
 *  6. every npm script appears in docs/reference/npm-scripts.md
 *  7. docs/agents/platform-manifest.json parses, templateIds match, keyFiles exist
 * Usage: node scripts/docs-check.mjs [--report] [--root <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIN_CHARS = 500;
const PATH_PREFIXES = ["src/", "scripts/", "tests/", "docs/", "public/"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "dist" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const stripFences = (md) => md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");

/** Visible prose length: no code blocks, link targets, markdown symbols or repeated whitespace. */
export function contentLength(md) {
  const text = stripFences(md)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`>|~\-=[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...text].length;
}

function markdownLinks(md) {
  const links = [];
  const re = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const m of stripFences(md).replace(/`[^`\n]*`/g, "").matchAll(re)) links.push(m[1]);
  return links;
}

function backtickPaths(md) {
  const out = new Set();
  for (const m of stripFences(md).matchAll(/`([^`\n]+)`/g)) {
    let p = m[1].trim();
    if (!PATH_PREFIXES.some((x) => p.startsWith(x))) continue;
    if (/[<*{[\s]|\.\.\./.test(p)) continue;
    p = p.replace(/#.*$/, "").replace(/:\d+(-\d+)?$/, "").replace(/[.,;:)]+$/, "");
    out.add(p);
  }
  return [...out];
}

function templateIds(root) {
  const src = read(path.join(root, "src/data/template-ids.ts"));
  if (!src) return null;
  const block = src.match(/\[([\s\S]*?)\]/);
  return block ? [...block[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]) : [];
}

function stripJsonComments(s) {
  let out = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += s[++i] ?? "";
      else if (c === '"') inStr = false;
    } else if (c === '"') { inStr = true; out += c; }
    else if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; }
    else if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i + 2); if (i < 0) break; i++; }
    else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Env var names from every config source. Missing sources are skipped. */
export function envVarNames(root) {
  const names = new Set();
  const env = read(path.join(root, "src/lib/server/env.ts"));
  if (env) {
    const block = env.match(/z\.object\(\{([\s\S]*?)\n\}\)/);
    for (const m of (block ? block[1] : "").matchAll(/^\s{2}([A-Z][A-Z0-9_]+)\s*:/gm)) names.add(m[1]);
  }
  const wr = read(path.join(root, "wrangler.jsonc"));
  if (wr) {
    try {
      const cfg = JSON.parse(stripJsonComments(wr));
      Object.keys(cfg.vars ?? {}).forEach((k) => names.add(k));
      (cfg.ratelimits ?? []).forEach((r) => r.name && names.add(r.name));
      [...(cfg.d1_databases ?? []), ...(cfg.r2_buckets ?? [])].forEach((b) => b.binding && names.add(b.binding));
    } catch {
      /* invalid wrangler.jsonc is reported by wrangler itself */
    }
  }
  for (const f of [".env.example", ".dev.vars.example"]) {
    const s = read(path.join(root, f));
    if (s) for (const m of s.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)) names.add(m[1]);
  }
  return [...names].sort();
}

export function runDocsCheck(root) {
  const errors = [];
  const pages = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join("/");
  const docFiles = walk(path.join(root, "docs"));
  if (!docFiles.length) errors.push("docs/: no markdown pages found");

  // 1. length
  for (const f of docFiles) {
    const chars = contentLength(read(f));
    pages.push({ file: rel(f), chars });
    if (chars < MIN_CHARS) errors.push(`${rel(f)}: only ${chars} content characters (min ${MIN_CHARS})`);
  }

  // 2 + 3. links and backtick paths
  const linkFiles = [...docFiles, ...["README.md", "AGENTS.md"].map((f) => path.join(root, f)).filter(fs.existsSync)];
  for (const f of linkFiles) {
    const md = read(f);
    for (const link of markdownLinks(md)) {
      if (/^(https?:|mailto:|#)/i.test(link)) continue;
      const target = decodeURIComponent(link.replace(/[#?].*$/, ""));
      if (!target) continue;
      if (!fs.existsSync(path.resolve(path.dirname(f), target))) errors.push(`${rel(f)}: broken link -> ${link}`);
    }
    if (f.startsWith(path.join(root, "docs"))) {
      for (const p of backtickPaths(md)) {
        if (!fs.existsSync(path.join(root, p))) errors.push(`${rel(f)}: path \`${p}\` does not exist`);
      }
    }
  }

  // 4. template ids
  const ids = templateIds(root);
  if (ids === null) errors.push("src/data/template-ids.ts: not found");
  for (const doc of ["docs/reference/template-schema.md", "docs/user-guide/templates.md"]) {
    const s = read(path.join(root, doc));
    if (s === null) { errors.push(`${doc}: missing`); continue; }
    for (const id of ids ?? []) if (!s.includes(id)) errors.push(`${doc}: template id "${id}" is not documented`);
  }

  // 5. env vars
  const envDoc = read(path.join(root, "docs/reference/config-env.md"));
  if (envDoc === null) errors.push("docs/reference/config-env.md: missing");
  else for (const n of envVarNames(root)) if (!envDoc.includes(n)) errors.push(`docs/reference/config-env.md: env var "${n}" is not documented`);

  // 6. npm scripts
  const pkg = read(path.join(root, "package.json"));
  const scriptsDoc = read(path.join(root, "docs/reference/npm-scripts.md"));
  if (pkg && scriptsDoc === null) errors.push("docs/reference/npm-scripts.md: missing");
  if (pkg && scriptsDoc !== null) {
    for (const s of Object.keys(JSON.parse(pkg).scripts ?? {})) {
      if (!scriptsDoc.includes(`\`${s}\``) && !scriptsDoc.includes(`npm run ${s}`)) {
        errors.push(`docs/reference/npm-scripts.md: script "${s}" is not documented`);
      }
    }
  }

  // 7. manifest
  const manPath = "docs/agents/platform-manifest.json";
  const man = read(path.join(root, manPath));
  if (man === null) errors.push(`${manPath}: missing`);
  else {
    try {
      const m = JSON.parse(man);
      const a = [...(m.templateIds ?? [])].sort().join(",");
      const b = [...(ids ?? [])].sort().join(",");
      if (a !== b) errors.push(`${manPath}: templateIds [${a}] != code [${b}]`);
      for (const sub of m.subsystems ?? []) {
        for (const k of sub.keyFiles ?? []) if (!fs.existsSync(path.join(root, k))) errors.push(`${manPath}: ${sub.id} keyFile ${k} does not exist`);
      }
    } catch (e) {
      errors.push(`${manPath}: invalid JSON (${e.message})`);
    }
  }

  return { ok: errors.length === 0, errors, pages };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const ri = args.indexOf("--root");
  const root = path.resolve(ri >= 0 ? args[ri + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const { ok, errors, pages } = runDocsCheck(root);
  if (args.includes("--report")) {
    for (const p of pages) console.log(`${String(p.chars).padStart(6)}  ${p.file}`);
    console.log(`${pages.length} pages, ${pages.reduce((s, p) => s + p.chars, 0)} content characters total`);
  }
  if (ok) console.log(`docs:check passed (${pages.length} pages)`);
  else {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`docs:check failed: ${errors.length} problem(s)`);
    process.exit(1);
  }
}
