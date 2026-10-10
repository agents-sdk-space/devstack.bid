import { addonSteps } from "@/data/addon-steps";
import { nvmStep, pnpmStep, pythonCheckStep, uvInstallStep, uvPythonStep, yarnStep } from "@/data/runtime-steps";
import { getTemplate, TEMPLATES } from "@/data/templates";
import { buildContext, resolveText, sanitizeProjectName, type PlaceholderContext } from "./placeholders";
import type {
  AddonId,
  BuilderConfig,
  BuilderEdits,
  L10n,
  ResolvedStep,
  StackTemplate,
  StepDef,
  StepSource,
} from "./types";
import { ADDON_IDS } from "./types";

export const DEFAULT_CONFIG: BuilderConfig = {
  templateId: "nextjs-dashboard",
  projectName: "nvx-dashboard",
  node: "lts",
  python: "3.12",
  jsPm: "npm",
  pyPm: "pip",
  addons: ["typescript", "tailwind", "eslint"],
};

/** Config for a template with its default add-ons and name. */
export function configForTemplate(templateId: string, base: Partial<BuilderConfig> = {}): BuilderConfig {
  const template = getTemplate(templateId) ?? TEMPLATES[0];
  return {
    ...DEFAULT_CONFIG,
    ...base,
    templateId: template.id,
    projectName: base.projectName ?? template.defaultName,
    addons: base.addons ?? [...template.defaultAddons],
  };
}

/** Normalise any (possibly untrusted) config into a valid one. */
export function normalizeConfig(input: Partial<BuilderConfig> | undefined): BuilderConfig {
  const template = getTemplate(input?.templateId ?? "") ?? getTemplate(DEFAULT_CONFIG.templateId)!;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  const addons = Array.isArray(input?.addons)
    ? (ADDON_IDS.filter((a) => (input!.addons as unknown[]).includes(a)) as AddonId[])
    : [...template.defaultAddons];
  return {
    templateId: template.id,
    projectName: sanitizeProjectName(input?.projectName, template.defaultName),
    node: pick(input?.node, ["lts", "24", "22", "20"] as const, "lts"),
    python: pick(input?.python, ["3.13", "3.12", "3.11"] as const, "3.12"),
    jsPm: pick(input?.jsPm, ["npm", "pnpm", "yarn"] as const, "npm"),
    pyPm: pick(input?.pyPm, ["pip", "uv"] as const, "pip"),
    addons,
  };
}

function resolveL10n(value: L10n, ctx: PlaceholderContext): L10n {
  return { en: resolveText(value.en, ctx), th: resolveText(value.th, ctx) };
}

/** Best-effort POSIX -> PowerShell adaptation for commands without an explicit Windows override. */
export function adaptForPowerShell(cmd: string, ctx: PlaceholderContext): string {
  return cmd
    .replace(/(^|\s)curl(\s)/g, "$1curl.exe$2")
    .replace(/^python3(\s)/, `py -${ctx.py}$1`)
    .replace(/\s&&\s/g, "; ");
}

function resolveStep(step: StepDef, ctx: PlaceholderContext, source: StepSource): ResolvedStep {
  return {
    id: step.id,
    title: resolveL10n(step.title, ctx),
    explanation: resolveL10n(step.explanation, ctx),
    commands: step.commands.map((c) => resolveText(c, ctx)),
    windows: step.windows
      ? step.windows.map((c) => resolveText(c, ctx))
      : step.commands.map((c) => adaptForPowerShell(resolveText(c, ctx), ctx)),
    files: (step.files ?? []).map((f) => ({ path: resolveText(f.path, ctx), content: resolveText(f.content, ctx) })),
    osNotes: step.osNotes ? resolveL10n(step.osNotes, ctx) : undefined,
    expected: resolveL10n(step.expected, ctx),
    verify: step.verify ? resolveText(step.verify, ctx) : undefined,
    verifyWindows: step.verifyWindows
      ? resolveText(step.verifyWindows, ctx)
      : step.verify
        ? adaptForPowerShell(resolveText(step.verify, ctx), ctx)
        : undefined,
    kind: step.kind ?? "setup",
    requires: step.requires,
    source,
  };
}

function matchesWhen(step: StepDef, config: BuilderConfig, template: StackTemplate): boolean {
  if (!step.when) return true;
  return Object.entries(step.when).every(([addon, wanted]) => {
    const on = config.addons.includes(addon as AddonId) && template.supportedAddons.includes(addon as AddonId);
    return on === wanted;
  });
}

/** Signature used to drop steps that do exactly the same thing under different ids. */
function signature(step: ResolvedStep): string {
  if (step.commands.length === 0 && step.files.length === 0) return `id:${step.id}`;
  return JSON.stringify([step.commands, step.files.map((f) => f.path)]);
}

/** Remove duplicate steps (same id, or identical commands + files). First occurrence wins. */
export function dedupeSteps(steps: ResolvedStep[]): ResolvedStep[] {
  const ids = new Set<string>();
  const sigs = new Set<string>();
  const out: ResolvedStep[] = [];
  for (const step of steps) {
    const sig = signature(step);
    if (ids.has(step.id) || sigs.has(sig)) continue;
    ids.add(step.id);
    sigs.add(sig);
    out.push(step);
  }
  return out;
}

/**
 * Compose the ordered, de-duplicated command sequence for a config:
 * runtime setup -> template steps (add-ons inserted before the first
 * long-running / publish / manual step).
 */
export function composeSteps(input: BuilderConfig): ResolvedStep[] {
  const config = normalizeConfig(input);
  const template = getTemplate(config.templateId)!;
  const ctx = buildContext(config, template);

  const runtime: StepDef[] = [];
  if (template.runtimes.includes("node")) {
    runtime.push(nvmStep);
    if (config.jsPm === "pnpm") runtime.push(pnpmStep);
    if (config.jsPm === "yarn") runtime.push(yarnStep);
  }
  if (template.runtimes.includes("python")) {
    if (config.pyPm === "uv") runtime.push(uvInstallStep, uvPythonStep);
    else runtime.push(pythonCheckStep);
  }

  const core = template.steps.filter((s) => matchesWhen(s, config, template));
  const extras = addonSteps(template, config);
  let insertAt = core.findIndex((s) => s.kind === "longRunning" || s.kind === "publish" || s.kind === "manual");
  if (insertAt === -1) insertAt = core.length;

  const resolved = [
    ...runtime.map((s) => resolveStep(s, ctx, "runtime")),
    ...core.slice(0, insertAt).map((s) => resolveStep(s, ctx, "template")),
    ...extras.map((s) => resolveStep(s, ctx, "addon")),
    ...core.slice(insertAt).map((s) => resolveStep(s, ctx, "template")),
  ];
  return dedupeSteps(resolved);
}

/**
 * Apply user edits (custom steps, removals, manual ordering) on top of the composed steps.
 * Steps missing from `order` (e.g. newly enabled add-ons) are inserted after their natural predecessor.
 */
export function applyEdits(composed: ResolvedStep[], edits: Partial<BuilderEdits>): ResolvedStep[] {
  // Custom steps (AI / user) go before the first long-running, publish or manual step.
  let cut = composed.findIndex((s) => s.kind !== "setup");
  if (cut === -1) cut = composed.length;
  const natural = dedupeSteps([...composed.slice(0, cut), ...(edits.custom ?? []), ...composed.slice(cut)]);
  const removed = new Set(edits.removed ?? []);
  const byId = new Map(natural.map((s) => [s.id, s]));
  const result: string[] = (edits.order ?? []).filter((id, i, arr) => byId.has(id) && !removed.has(id) && arr.indexOf(id) === i);

  natural.forEach((step, index) => {
    if (removed.has(step.id) || result.includes(step.id)) return;
    let pos = 0;
    for (let j = index - 1; j >= 0; j--) {
      const at = result.indexOf(natural[j].id);
      if (at !== -1) {
        pos = at + 1;
        break;
      }
    }
    result.splice(pos, 0, step.id);
  });
  return result.map((id) => byId.get(id)!);
}

/** Move a step up (-1) or down (+1) and return the new order of ids. */
export function moveStep(ids: string[], id: string, delta: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Flat list of all commands (POSIX) in order — what "Copy all" puts on the clipboard. */
export function flattenCommands(steps: ResolvedStep[], os: "posix" | "windows" = "posix"): string[] {
  return steps.flatMap((s) => (os === "windows" ? s.windows : s.commands));
}
