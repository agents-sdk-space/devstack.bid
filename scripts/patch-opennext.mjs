// Compatibility patch for @opennextjs/cloudflare <= 1.20.10 with Next.js 16.4:
// Next 16.4 loads `.next/server/preview-props.json` through loadManifest(), but the adapter only
// inlines `*-manifest.json`, `required-server-files.json` and `prefetch-hints.json`, so every
// request fails with "Unexpected loadManifest(/.next/server/preview-props.json) call!".
// This idempotent patch adds preview-props to the inlined set. Runs on `npm install` (postinstall).
// Remove once the adapter ships the fix.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js";
const from = "**/{*-manifest,required-server-files,prefetch-hints}.json";
const to = "**/{*-manifest,required-server-files,prefetch-hints,preview-props}.json";

if (!existsSync(file)) {
  console.log("[patch-opennext] adapter not installed, skipping");
} else {
  const src = readFileSync(file, "utf8");
  if (src.includes(to)) console.log("[patch-opennext] already applied");
  else if (src.includes(from)) {
    writeFileSync(file, src.replace(from, to));
    console.log("[patch-opennext] applied preview-props.json inlining");
  } else console.warn("[patch-opennext] pattern not found — adapter changed; check if the patch is still needed");
}
