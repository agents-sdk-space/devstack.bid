#!/usr/bin/env node
/**
 * studio:build — builds the Studio sub-app (studio/, Vite + React, the merged DEVSTACK workspace)
 * into public/studio, which the Next.js/OpenNext build then ships as Worker static assets
 * (/studio/*, headers in public/_headers). Runs from npm `prebuild`, so `npm run build`,
 * `npm run cf:build`, `preview` and `deploy` always include a fresh Studio.
 *
 * - Installs studio/node_modules with `npm ci` when missing (the Studio has its own lockfile, so its
 *   dependencies — Vite 8, Monaco, PGlite, Sucrase, xterm — never touch the Next.js tree).
 * - Re-syncs the brand copies first (scripts/sync-studio-brand.mjs).
 * - Skips the Vite build when the inputs are unchanged (hash stamp in public/studio/.build-stamp).
 * Usage: node scripts/build-studio.mjs [--force]
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = path.join(ROOT, "studio");
const OUT = path.join(ROOT, "public/studio");
const STAMP = path.join(OUT, ".build-stamp");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, cwd = STUDIO) {
  execFileSync(npm, args, { cwd, stdio: "inherit" });
}

function inputsHash() {
  const h = crypto.createHash("sha256");
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", "test-results", "playwright-report", "e2e", "dist"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (path.relative(STUDIO, p) === path.join("public", "preview", "vendor.js")) continue; // build output
      if (e.isDirectory()) walk(p);
      else h.update(path.relative(STUDIO, p)).update(fs.readFileSync(p));
    }
  };
  walk(STUDIO);
  return h.digest("hex");
}

if (!fs.existsSync(path.join(STUDIO, "package.json"))) {
  console.log("studio:build skipped (no studio/ folder)");
  process.exit(0);
}
execFileSync(process.execPath, [path.join(ROOT, "scripts/sync-studio-brand.mjs")], { stdio: "inherit" });
if (!fs.existsSync(path.join(STUDIO, "node_modules"))) run(["ci", "--no-audit", "--no-fund"]);

const hash = inputsHash();
if (!process.argv.includes("--force") && fs.existsSync(STAMP) && fs.readFileSync(STAMP, "utf8") === hash && fs.existsSync(path.join(OUT, "index.html"))) {
  console.log("studio:build up to date (public/studio)");
  process.exit(0);
}
run(["run", "build:web"]);
fs.writeFileSync(STAMP, hash);
const files = [];
const list = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? list(path.join(d, e.name)) : files.push(fs.statSync(path.join(d, e.name)).size)));
list(OUT);
const big = Math.max(...files);
console.log(`studio:build wrote ${files.length} files, ${(files.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} MB, largest ${(big / 1e6).toFixed(1)} MB (limit 25 MiB per file)`);
if (big > 25 * 1024 * 1024) {
  console.error("studio:build a file exceeds the 25 MiB Workers static-asset limit");
  process.exit(1);
}
