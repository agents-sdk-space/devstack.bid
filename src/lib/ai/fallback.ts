import { getTemplate, TEMPLATES } from "@/data/templates";
import { composeSteps, configForTemplate } from "../composer";
import { buildContext, resolveText, sanitizeProjectName } from "../placeholders";
import type { AddonId, JsPm, Lang, PyPm, StackTemplate } from "../types";
import type { AgentPlan } from "./types";

/**
 * Deterministic, rule-based planner. Works offline with no API key, and is used
 * whenever the OpenAI call is unavailable or fails.
 */

const PYTHON_HINTS = ["python", "ไพธอน", "ไพทอน", "fastapi", "django", "flask", "pandas", "streamlit", "pip ", "pypi", "uv "];
const NODE_HINTS = ["node", "javascript", "typescript", "react", "next.js", "nextjs", "vite", "npm", "npx", "express"];

const ADDON_HINTS: Record<AddonId, string[]> = {
  typescript: ["typescript", " ts ", "type-safe", "ไทป์สคริปต์"],
  tailwind: ["tailwind"],
  eslint: ["eslint", "lint", "ruff", "ตรวจโค้ด"],
  testing: ["test", "vitest", "pytest", "jest", "ทดสอบ", "เทสต์", "เทส"],
  docker: ["docker", "container", "คอนเทนเนอร์", "ด็อกเกอร์"],
  ci: [" ci", "ci/cd", "github actions", "pipeline", "workflow"],
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ASCII keywords match on word boundaries ("ai" must not match "email"); Thai uses substring match. */
export function hasKeyword(text: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (/^[a-z0-9 .\-/+]+$/.test(kw)) return new RegExp(`(^|[^a-z0-9])${escapeRe(kw)}(s|es|ing)?($|[^a-z0-9])`).test(text);
  return text.includes(kw);
}

function score(template: StackTemplate, text: string, wantsPython: boolean, wantsNode: boolean): number {
  let total = 0;
  for (const kw of template.keywords) {
    if (hasKeyword(text, kw)) total += kw.includes(" ") ? 3 : 2;
  }
  if (text.includes(template.id.replace(/-/g, " "))) total += 3;
  if (wantsPython && template.runtimes.includes("python")) total += 2;
  if (wantsNode && template.runtimes.includes("node")) total += 1;
  if (wantsPython && !wantsNode && !template.runtimes.includes("python")) total -= 2;
  return total;
}

export function chooseTemplate(prompt: string): StackTemplate {
  const text = ` ${prompt.toLowerCase()} `;
  const wantsPython = PYTHON_HINTS.some((h) => hasKeyword(text, h.trim()));
  const wantsNode = NODE_HINTS.some((h) => hasKeyword(text, h.trim()));
  let best = TEMPLATES[0];
  let bestScore = 0;
  for (const t of TEMPLATES) {
    const s = score(t, text, wantsPython, wantsNode);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  // No keyword matched: a plain website is the safest general default (not the dashboard).
  if (bestScore <= 0) return getTemplate(wantsPython ? "fastapi-ai" : "static-website")!;
  return best;
}

export function extractProjectName(prompt: string): string | undefined {
  const patterns = [
    /(?:called|named|name it|project name(?: is)?)\s+["'“]?([a-z0-9][\w.-]{1,40})/i,
    /ชื่อ(?:โปรเจกต์|โปรเจค|แอป)?\s*(?:ว่า)?\s*["'“]?([a-z0-9][\w.-]{1,40})/i,
    /["“]([a-z0-9][\w.-]{1,40})["”]/i,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m) return sanitizeProjectName(m[1]);
  }
  return undefined;
}

export function planFallback(prompt: string, lang: Lang, reason?: string): AgentPlan {
  const text = ` ${prompt.toLowerCase()} `;
  const template = chooseTemplate(prompt);
  const addons = new Set<AddonId>(template.defaultAddons);
  (Object.keys(ADDON_HINTS) as AddonId[]).forEach((id) => {
    if (ADDON_HINTS[id].some((h) => hasKeyword(text, h.trim()))) addons.add(id);
  });
  if (/(no typescript|plain javascript|javascript only|ไม่ใช้ typescript)/.test(text)) addons.delete("typescript");
  const jsPm: JsPm = text.includes("pnpm") ? "pnpm" : text.includes("yarn") ? "yarn" : "npm";
  const pyPm: PyPm = /\buv\b/.test(text) ? "uv" : "pip";
  const supported = [...addons].filter((a) => template.supportedAddons.includes(a));

  const config = configForTemplate(template.id, {
    projectName: extractProjectName(prompt) ?? template.defaultName,
    addons: supported,
    jsPm,
    pyPm,
  });
  const ctx = buildContext(config, template);
  const steps = composeSteps(config);
  const starterFiles = steps.flatMap((s) => s.files).slice(0, 4);

  const summary =
    lang === "th"
      ? `ตัววางแผนแบบกฎ (ออฟไลน์) เลือกเทมเพลต “${template.name.th}”: ${template.summary.th} มีทั้งหมด ${steps.length} ขั้นตอน คุณปรับลำดับ ลบขั้นตอน หรือเปลี่ยน add-on ได้ในตัวสร้างสแต็ก`
      : `The rule-based (offline) planner picked “${template.name.en}”: ${template.summary.en} It has ${steps.length} ordered steps — reorder, remove or change add-ons in the builder.`;

  return {
    source: "fallback",
    fallbackReason: reason,
    lang,
    templateId: template.id,
    projectName: config.projectName,
    summary,
    addons: supported,
    jsPm,
    pyPm,
    extraSteps: [],
    fileTree: template.fileTree.map((l) => resolveText(l, ctx)),
    starterFiles,
    nextSteps: template.nextSteps.map((n) => n[lang]),
    warnings: [],
  };
}
