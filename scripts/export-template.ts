/**
 * Export a template as setup.sh / setup.ps1 from the command line.
 *
 *   npm run export -- <templateId> [--name my-app] [--pm npm|pnpm|yarn] [--py pip|uv]
 *                     [--addons typescript,tailwind] [--out ./out] [--lang en|th]
 *
 * Handy for contributors to test a template end-to-end:  cd out && bash setup.sh
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_IDS } from "../src/data/templates";
import { composeSteps, configForTemplate } from "../src/lib/composer";
import { toBash, toPowerShell, toReadme } from "../src/lib/scripts";
import type { AddonId, JsPm, Lang, PyPm } from "../src/lib/types";

const args = process.argv.slice(2);
const templateId = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

if (!templateId || !TEMPLATE_IDS.includes(templateId)) {
  console.error(`Usage: npm run export -- <templateId> [options]\nTemplates: ${TEMPLATE_IDS.join(", ")}`);
  process.exit(1);
}

const config = configForTemplate(templateId, {
  ...(opt("name") ? { projectName: opt("name") } : {}),
  ...(opt("pm") ? { jsPm: opt("pm") as JsPm } : {}),
  ...(opt("py") ? { pyPm: opt("py") as PyPm } : {}),
  ...(opt("addons") !== undefined ? { addons: opt("addons")!.split(",").filter(Boolean) as AddonId[] } : {}),
});
const lang = (opt("lang") as Lang) ?? "en";
const out = opt("out") ?? join("out", templateId);
const steps = composeSteps(config);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "setup.sh"), toBash(steps, config, lang), { mode: 0o755 });
writeFileSync(join(out, "setup.ps1"), toPowerShell(steps, config, lang));
writeFileSync(join(out, "README.md"), toReadme(steps, config, lang));
console.log(`Wrote ${out}/setup.sh, setup.ps1, README.md (${steps.length} steps)`);
