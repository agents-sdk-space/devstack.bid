import { getTemplate } from "@/data/templates";
import { z } from "zod";
import { composeSteps, configForTemplate } from "../composer";
import { buildContext, resolveText, sanitizeProjectName } from "../placeholders";
import { cleanFile, cleanText, sanitizeStep } from "../sanitize";
import { ADDON_IDS, type AddonId, type Lang, type ResolvedStep, type StarterFile } from "../types";
import type { AgentPlan } from "./types";

const rawPlanSchema = z.object({
  templateId: z.string(),
  projectName: z.string(),
  summary: z.string(),
  addons: z.array(z.string()),
  packageManager: z.enum(["npm", "pnpm", "yarn"]).catch("npm"),
  pythonPackageManager: z.enum(["pip", "uv"]).catch("pip"),
  extraSteps: z
    .array(z.object({ title: z.string(), explanation: z.string(), commands: z.array(z.string()), verify: z.string() }))
    .catch([]),
  fileTree: z.array(z.string()).catch([]),
  starterFiles: z.array(z.object({ path: z.string(), content: z.string() })).catch([]),
  nextSteps: z.array(z.string()).catch([]),
});

/**
 * Validate and sanitise raw model output into an AgentPlan.
 * Throws if the shape is unusable (caller falls back to the rule-based planner).
 */
export function sanitizeAiPlan(raw: unknown, lang: Lang, model: string): AgentPlan {
  const parsed = rawPlanSchema.parse(raw);
  const template = getTemplate(parsed.templateId);
  if (!template) throw new Error(`Unknown template: ${cleanText(parsed.templateId, 60)}`);
  const warnings: string[] = [];

  const addons = parsed.addons.filter(
    (a): a is AddonId => (ADDON_IDS as readonly string[]).includes(a) && template.supportedAddons.includes(a as AddonId)
  );
  const projectName = sanitizeProjectName(parsed.projectName, template.defaultName);
  const config = configForTemplate(template.id, {
    projectName,
    addons: [...new Set(addons)],
    jsPm: parsed.packageManager,
    pyPm: parsed.pythonPackageManager,
  });
  const templateCommands = new Set(composeSteps(config).flatMap((s) => s.commands));

  const extraSteps: ResolvedStep[] = [];
  parsed.extraSteps.slice(0, 6).forEach((s, i) => {
    const step = sanitizeStep({ ...s, kind: "setup" }, `custom-ai-${i + 1}`);
    const dropped = s.commands.length - (step?.commands.length ?? 0);
    if (dropped > 0) warnings.push(lang === "th" ? `ตัดคำสั่งที่ไม่ปลอดภัยหรือไม่ถูกต้องออก ${dropped} คำสั่ง` : `Removed ${dropped} unsafe or invalid command(s).`);
    if (!step) return;
    step.commands = step.commands.filter((c) => !templateCommands.has(c));
    step.windows = step.windows.filter((c) => !templateCommands.has(c));
    if (step.commands.length === 0) return;
    if (step.kind === "manual") {
      warnings.push(lang === "th" ? `ขั้นตอน “${step.title.th}” ต้องตรวจสอบด้วยตนเองก่อนรัน` : `Step “${step.title.en}” needs a manual review before running.`);
    }
    extraSteps.push(step);
  });

  const starterFiles = parsed.starterFiles
    .slice(0, 4)
    .map(cleanFile)
    .filter((f): f is StarterFile => f !== null);
  if (starterFiles.length < Math.min(parsed.starterFiles.length, 4)) {
    warnings.push(lang === "th" ? "ตัดไฟล์ที่มี path ไม่ปลอดภัยออก" : "Dropped starter file(s) with unsafe paths.");
  }

  const ctx = buildContext(config, template);
  const fileTree = parsed.fileTree.map((l) => cleanText(l, 160)).filter(Boolean).slice(0, 40);

  return {
    source: "openai",
    model: cleanText(model, 80),
    lang,
    templateId: template.id,
    projectName: config.projectName,
    summary: cleanText(parsed.summary, 1500) || template.summary[lang],
    addons: config.addons,
    jsPm: config.jsPm,
    pyPm: config.pyPm,
    extraSteps,
    fileTree: fileTree.length ? fileTree : template.fileTree.map((l) => resolveText(l, ctx)),
    starterFiles,
    nextSteps: parsed.nextSteps.map((n) => cleanText(n, 300)).filter(Boolean).slice(0, 8),
    warnings,
  };
}
