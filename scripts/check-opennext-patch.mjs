// Fails the Cloudflare build when the OpenNext compatibility patch is missing.
// scripts/patch-opennext.mjs (postinstall) adds preview-props.json to the manifests the adapter
// inlines. If postinstall was skipped (npm ci --ignore-scripts, pnpm/bun without lifecycle scripts,
// or a reinstall of the adapter), the Worker builds fine but every request fails in production with
// "Unexpected loadManifest(/.next/server/preview-props.json) call!" (Worker version 0286ef58, 2026-10-17).
//
//   node scripts/check-opennext-patch.mjs            check node_modules before `opennextjs-cloudflare build`
//   node scripts/check-opennext-patch.mjs --output   check .open-next after the build
//
// Keep the pattern in sync with scripts/patch-opennext.mjs.
import { existsSync, readFileSync } from "node:fs";

const ADAPTER_FILE = "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js";
const PATCHED = "**/{*-manifest,required-server-files,prefetch-hints,preview-props}.json";
const HANDLER = ".open-next/server-functions/default/handler.mjs";
// The inlined loadManifest() returns the manifest object for preview-props.json when the patch was active.
const INLINED = /endsWith\(\s*["'`]\/server\/preview-props\.json["'`]\s*\)\s*\)\s*\{?\s*return\s*\{/;
const FIX = "Run `npm ci` (with install scripts enabled) or `node scripts/patch-opennext.mjs`, then build again.";

function fail(msg) {
  console.error(`\n[check-opennext-patch] ERROR: ${msg}\n[check-opennext-patch] ${FIX}\n`);
  process.exit(1);
}

if (process.argv.includes("--output")) {
  if (!existsSync(HANDLER)) fail(`${HANDLER} not found; the OpenNext build did not produce a server handler.`);
  if (!INLINED.test(readFileSync(HANDLER, "utf8"))) {
    fail(`${HANDLER} does not inline .next/server/preview-props.json. Every request would fail with "Unexpected loadManifest(/.next/server/preview-props.json) call!". Do not deploy this build.`);
  }
  console.log("[check-opennext-patch] build output inlines preview-props.json");
} else {
  if (!existsSync(ADAPTER_FILE)) fail(`${ADAPTER_FILE} not found; @opennextjs/cloudflare is not installed or its layout changed.`);
  if (!readFileSync(ADAPTER_FILE, "utf8").includes(PATCHED)) {
    fail(`@opennextjs/cloudflare is not patched (scripts/patch-opennext.mjs did not run): ${ADAPTER_FILE} does not contain the preview-props.json pattern.`);
  }
  console.log("[check-opennext-patch] adapter patch present");
}
