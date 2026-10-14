// After `opennextjs-cloudflare build`, re-export the Workflow class from the generated
// worker entry. Wrangler only registers it once `workflows` is set in wrangler.jsonc.
// The binding stays out of the production config until the owner creates the resources.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = ".open-next/worker.js";
const line = 'export { MediaLifecycleWorkflow } from "../src/workflows/media-lifecycle.ts";';

if (!existsSync(file)) {
  console.log("[patch-opennext-worker] .open-next/worker.js missing, skipping");
} else {
  const src = readFileSync(file, "utf8");
  if (src.includes("MediaLifecycleWorkflow")) console.log("[patch-opennext-worker] already applied");
  else {
    writeFileSync(file, `${src.trimEnd()}\n${line}\n`);
    console.log("[patch-opennext-worker] exported MediaLifecycleWorkflow");
  }
}
