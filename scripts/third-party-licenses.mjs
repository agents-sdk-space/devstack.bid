#!/usr/bin/env node
/**
 * licenses: audit + THIRD_PARTY_LICENSES.md for every production dependency of the site
 * (package-lock.json) and the Studio (studio/package-lock.json), read offline from the lockfiles.
 *
 *   node scripts/third-party-licenses.mjs          # write THIRD_PARTY_LICENSES.md
 *   node scripts/third-party-licenses.mjs --check  # fail if the file is stale or a license is not allowed
 *
 * Policy: only OSI-approved permissive licenses (plus OFL-1.1 for fonts, CC0-1.0 and the
 * PostgreSQL License) and no commercial or usage-based terms. For "A OR B" one allowed option is
 * enough (we take it); for "A AND B" every part must be allowed. CC-BY-4.0 is allowed only for the
 * build-time data package caniuse-lite (attribution, never shipped to the Worker or the browser).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "THIRD_PARTY_LICENSES.md");

export const ALLOWED = new Set([
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Apache-2.0", "Zlib", "BlueOak-1.0.0",
  "Unlicense", "CC0-1.0", "OFL-1.1", "PostgreSQL",
]);
/** Per-package exceptions: name -> license, with the reason shown in the report. */
export const EXCEPTIONS = {
  "caniuse-lite": { license: "CC-BY-4.0", reason: "browser-support data used at build time by Next.js/browserslist; not shipped; attribution below" },
};

/** Packages that ship non-npm code inside them (credited in their own section). */
const BUNDLED = [
  ["@electric-sql/pglite", "Apache-2.0 OR PostgreSQL License (dual, our choice: Apache-2.0)", "PostgreSQL compiled to WASM. PostgreSQL itself: PostgreSQL License (OSI-approved, permissive)."],
  ["@electric-sql/pglite-pgvector", "Apache-2.0", "pgvector extension, PostgreSQL License (OSI-approved, permissive)."],
  ["monaco-editor", "MIT", "Ships ThirdPartyNotices.txt: Node.js path (MIT), marked (MIT), TypeScript (Apache-2.0), W3C HTML 5.1 data (W3C Software and Document License), js-beautify (MIT), Ionic docs (Apache-2.0), vscode-swift (MIT)."],
  ["dompurify", "MPL-2.0 OR Apache-2.0 (our choice: Apache-2.0)", "Pulled in by monaco-editor."],
  ["jszip", "MIT OR GPL-3.0-or-later (our choice: MIT)", "Export zip (Studio) and downloads (site)."],
  ["@fontsource/inter, @fontsource/ibm-plex-mono, @fontsource/ibm-plex-sans-thai", "OFL-1.1", "Fonts bundled into /studio/. The site loads the same families through next/font (OFL-1.1)."],
  ["sucrase", "MIT", "In-browser JSX/TS compiler for the Studio static preview."],
];

const OTHER_ASSETS = [
  ["Simple Icons (brand logo path data)", "CC0-1.0", "Copied into src/components/brand/brand-icons.data.ts and studio/src/brand/ by scripts. Logos are trademarks of their owners (see NOTICE)."],
  ["Lucide icons (lucide-react)", "ISC", "UI icons on the site."],
  ["NVX mascot, terminal signature, design tokens", "MIT (this repository)", "Our own work."],
];

function splitTop(expr, op) {
  const parts = [];
  let depth = 0, cur = "";
  const tokens = expr.split(/(\(|\)|\s+)/).filter((t) => t !== undefined && t !== "");
  for (const t of tokens) {
    if (t === "(") depth++;
    if (t === ")") depth--;
    if (depth === 0 && t.trim() === op) { parts.push(cur.trim()); cur = ""; continue; }
    cur += t;
  }
  parts.push(cur.trim());
  return parts;
}

function strip(expr) {
  let e = expr.trim();
  while (e.startsWith("(") && e.endsWith(")")) {
    let depth = 0, wraps = true;
    for (let i = 0; i < e.length; i++) {
      if (e[i] === "(") depth++;
      if (e[i] === ")") depth--;
      if (depth === 0 && i < e.length - 1) { wraps = false; break; }
    }
    if (!wraps) break;
    e = e.slice(1, -1).trim();
  }
  return e;
}

/** Evaluate an SPDX expression against the allow-list. */
export function isAllowed(expr, name) {
  const e = strip(expr || "");
  if (!e) return false;
  const ors = splitTop(e, "OR");
  if (ors.length > 1) return ors.some((x) => isAllowed(x, name));
  const ands = splitTop(e, "AND");
  if (ands.length > 1) return ands.every((x) => isAllowed(x, name));
  if (ALLOWED.has(e)) return true;
  return EXCEPTIONS[name]?.license === e;
}

/** Production (non-dev) packages from an npm v3 lockfile. */
export function productionPackages(lockPath) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const out = [];
  for (const [key, v] of Object.entries(lock.packages ?? {})) {
    if (!key || v.dev || v.link) continue;
    const name = v.name ?? key.split("node_modules/").pop();
    out.push({ name, version: v.version ?? "", license: v.license ?? "UNKNOWN", optional: Boolean(v.optional) });
  }
  const seen = new Set();
  return out
    .filter((p) => (seen.has(`${p.name}@${p.version}`) ? false : seen.add(`${p.name}@${p.version}`)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function audit() {
  const sets = [
    ["Site (devstack.bid, Next.js Worker)", productionPackages(path.join(ROOT, "package-lock.json"))],
    ["Studio (/studio/, browser bundle)", productionPackages(path.join(ROOT, "studio", "package-lock.json"))],
  ];
  const flagged = [];
  for (const [label, pkgs] of sets) for (const p of pkgs) if (!isAllowed(p.license, p.name)) flagged.push({ ...p, set: label });
  return { sets, flagged };
}

export function render({ sets, flagged }) {
  const lines = [
    "# Third-party licenses",
    "",
    "<!-- Generated by scripts/third-party-licenses.mjs (npm run licenses). Do not edit by hand. -->",
    "",
    "devstack.bid (NVX Stack Builder, including the Studio) is MIT-licensed (see [LICENSE](./LICENSE)).",
    "This file lists every **production** dependency of the site and of the Studio, read from the npm",
    "lockfiles, and the non-npm assets we ship. Policy (checked in CI by `npm test`): OSI-approved",
    "permissive licenses only, plus OFL-1.1 for fonts, CC0-1.0 and the PostgreSQL License, and nothing",
    "with commercial or usage-based terms. For dual licenses we use the permissive option.",
    "",
    "เราใช้เฉพาะ dependency ที่เป็น open source แบบ permissive (เข้ากันได้กับ MIT) และไม่มีเงื่อนไขค่าใช้จ่ายเชิงพาณิชย์",
    "ไฟล์นี้สร้างอัตโนมัติจาก lockfile ด้วย `npm run licenses`",
    "",
    "## Summary",
    "",
    "| Set | Packages | Licenses | Flagged |",
    "|---|---|---|---|",
  ];
  for (const [label, pkgs] of sets) {
    const counts = {};
    for (const p of pkgs) counts[p.license] = (counts[p.license] ?? 0) + 1;
    const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ×${n}`).join(", ");
    const f = pkgs.filter((p) => !isAllowed(p.license, p.name)).length;
    lines.push(`| ${label} | ${pkgs.length} | ${summary} | ${f} |`);
  }
  lines.push("", "## Exceptions and notes", "");
  for (const [name, e] of Object.entries(EXCEPTIONS)) lines.push(`- \`${name}\`: ${e.license}, ${e.reason}.`);
  lines.push(
    "- `sharp` / `@img/sharp-libvips-*` (LGPL-3.0-or-later): optional native image library pulled in by `next` and `wrangler` for local builds and `next dev`. It is marked dev/optional in the lockfile, is not in the Worker bundle, and is not shipped. No action needed.",
    "- No dependency requires a paid or commercial license. WebContainers (`@webcontainer/api`, commercial terms for some production use) was removed in 0.8.0-rc.2.",
  );
  if (flagged.length) {
    lines.push("", "## Flagged (not allowed by policy)", "");
    for (const p of flagged) lines.push(`- ${p.set}: \`${p.name}@${p.version}\`: ${p.license}`);
  }
  lines.push("", "## Bundled code inside packages", "", "| Package | License | Notes |", "|---|---|---|");
  for (const [n, l, note] of BUNDLED) lines.push(`| \`${n}\` | ${l} | ${note} |`);
  lines.push("", "## Other assets", "", "| Asset | License | Notes |", "|---|---|---|");
  for (const [n, l, note] of OTHER_ASSETS) lines.push(`| ${n} | ${l} | ${note} |`);
  for (const [label, pkgs] of sets) {
    lines.push("", `## ${label}`, "", "| Package | Version | License |", "|---|---|---|");
    for (const p of pkgs) lines.push(`| \`${p.name}\` | ${p.version} | ${p.license}${p.optional ? " (optional)" : ""} |`);
  }
  lines.push(
    "",
    "## Attribution",
    "",
    "- caniuse-lite: data from [caniuse.com](https://caniuse.com) by Alexis Deveria, CC-BY-4.0.",
    "- Full license texts are in each package under `node_modules/<name>/LICENSE` (site) and `studio/node_modules/<name>/LICENSE` (Studio).",
    "",
  );
  return lines.join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = audit();
  const text = render(result);
  if (process.argv.includes("--check")) {
    const stale = !fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== text;
    if (result.flagged.length) console.error(`licenses: ${result.flagged.length} flagged:\n` + result.flagged.map((p) => `  ${p.name}@${p.version} ${p.license}`).join("\n"));
    if (stale) console.error("licenses: THIRD_PARTY_LICENSES.md is stale, run npm run licenses");
    if (result.flagged.length || stale) process.exit(1);
    console.log(`licenses: ok (${result.sets.map(([l, p]) => `${p.length} ${l.split(" ")[0].toLowerCase()}`).join(", ")}, 0 flagged)`);
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`licenses: wrote THIRD_PARTY_LICENSES.md (${result.flagged.length} flagged)`);
  }
}
