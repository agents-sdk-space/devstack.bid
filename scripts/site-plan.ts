/**
 * CLI for the agent's function tools, so the Python reference app (agents/orchestrator) uses the
 * exact same implementation as the Worker:
 *   echo '{"site_name":"..."}' | npx tsx scripts/site-plan.ts            -> generate_ai_agents_website
 *   echo '{"query":"deploy"}'  | npx tsx scripts/site-plan.ts --docs     -> get_agents_sdk_info
 * Reads JSON on stdin, writes JSON on stdout. Exit code 2 on invalid input.
 */
import fs from "node:fs";
import path from "node:path";
import { generateSitePlan } from "../src/lib/chat/site-plan";
import { getAgentsSdkInfo } from "../src/lib/chat/docs-info";

const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
try {
  if (process.argv.includes("--docs")) {
    const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/docs-search-index.json"), "utf8"));
    process.stdout.write(JSON.stringify(getAgentsSdkInfo(Array.isArray(index) ? index : index.entries, input.query)));
  } else {
    process.stdout.write(JSON.stringify(generateSitePlan(input)));
  }
} catch (err) {
  process.stderr.write(`invalid input: ${(err as Error).message.slice(0, 300)}\n`);
  process.exit(2);
}
