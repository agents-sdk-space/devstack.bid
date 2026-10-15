#!/usr/bin/env node
// Sync src/data/plugin-catalog.json from a pinned commit of agents-sdk-space/devstack-plugins (MIT).
// Usage: node scripts/sync-plugin-catalog.mjs [--commit <sha>] [--check]
// Metadata only: nothing from the catalog is installed or executed. Run manually; the site never fetches at runtime.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = "agents-sdk-space/devstack-plugins";
export const DEFAULT_COMMIT = "cb82a660517fc87ec5d52caef3e9a5fd86e155c9";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "plugin-catalog.json");
const CATEGORIES = ["development", "deployment", "database", "monitoring", "testing", "payments", "productivity", "design", "ai"];
const FIELDS = ["name", "description", "category", "homepage", "source", "keywords"];

export function validateCatalog(data) {
  const errors = [];
  if (!data || !Array.isArray(data.plugins)) return ["'plugins' must be an array"];
  const seen = new Set();
  data.plugins.forEach((p, i) => {
    const at = `plugins[${i}]`;
    if (!p || typeof p !== "object") return errors.push(`${at}: not an object`);
    for (const k of FIELDS) if (!(k in p)) errors.push(`${at}: missing ${k}`);
    for (const k of Object.keys(p)) if (!FIELDS.includes(k)) errors.push(`${at}: unknown key ${k}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.name ?? "")) errors.push(`${at}: bad name`);
    if (seen.has(p.name)) errors.push(`${at}: duplicate name`);
    seen.add(p.name);
    if (typeof p.description !== "string" || p.description.length < 10 || p.description.length > 200) errors.push(`${at}: bad description`);
    if (!CATEGORIES.includes(p.category)) errors.push(`${at}: bad category`);
    if (!/^https:\/\/[^\s"'<>]+$/.test(p.homepage ?? "")) errors.push(`${at}: homepage must be https`);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.source ?? "")) errors.push(`${at}: bad source`);
    if (!Array.isArray(p.keywords) || !p.keywords.length || p.keywords.some((k) => !/^[a-z0-9-]+$/.test(k))) errors.push(`${at}: bad keywords`);
  });
  return errors;
}

export function toSnapshot(data, commit) {
  return {
    source: { repo: REPO, commit, license: "MIT", url: `https://github.com/${REPO}/blob/${commit}/catalog/plugins.json` },
    plugins: data.plugins.map((p) => Object.fromEntries(FIELDS.map((k) => [k, p[k]]))).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--commit");
  const commit = i >= 0 ? args[i + 1] : DEFAULT_COMMIT;
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("--commit must be a full 40-char SHA");
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/catalog/plugins.json`);
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  const errors = validateCatalog(data);
  if (errors.length) throw new Error(`catalog invalid:\n  - ${errors.join("\n  - ")}`);
  const text = JSON.stringify(toSnapshot(data, commit), null, 2) + "\n";
  if (args.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== text) throw new Error("src/data/plugin-catalog.json is out of date; run npm run plugins:sync");
    console.log("plugin catalog up to date");
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote ${data.plugins.length} plugins from ${REPO}@${commit.slice(0, 7)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
