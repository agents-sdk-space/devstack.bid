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

const isAscii = (kw: string) => /^[a-z0-9 .\-/+]+$/.test(kw.toLowerCase());

/** Every keyword (all templates) found in the text. Thai keywords use substring match, so a Thai keyword
 * that only occurs inside a longer matched keyword is dropped (longest match wins: "เว็บแอป" is not "เว็บ"). */
function matchedKeywords(text: string): Set<string> {
  const all = new Set<string>();
  for (const t of TEMPLATES) for (const kw of [...t.keywords, ...(t.weakKeywords ?? [])]) if (hasKeyword(text, kw)) all.add(kw.toLowerCase());
  const thai = [...all].filter((k) => !isAscii(k));
  for (const k of thai) {
    const longer = thai.filter((o) => o.length > k.length && o.includes(k));
    if (!longer.length) continue;
    // Keep k only if it also appears somewhere outside every longer match.
    let rest = text;
    for (const o of longer) rest = rest.split(o).join(" ");
    if (!rest.includes(k)) all.delete(k);
  }
  return all;
}

function score(template: StackTemplate, text: string, matched: Set<string>, wantsPython: boolean, wantsNode: boolean): { total: number; hits: number } {
  let total = 0;
  let hits = 0;
  for (const kw of template.keywords) {
    if (matched.has(kw.toLowerCase())) { total += kw.includes(" ") ? 3 : 2; hits++; }
  }
  const weak = (template.weakKeywords ?? []).filter((kw) => matched.has(kw.toLowerCase())).length;
  if (weak) { total += 1; hits += weak; }
  if (text.includes(template.id.replace(/-/g, " "))) total += 3;
  if (wantsPython && template.runtimes.includes("python")) total += 2;
  if (wantsNode && template.runtimes.includes("node")) total += 1;
  if (wantsPython && !wantsNode && !template.runtimes.includes("python")) total -= 2;
  return { total, hits };
}

export function chooseTemplate(prompt: string): StackTemplate {
  const text = ` ${prompt.toLowerCase()} `;
  const wantsPython = PYTHON_HINTS.some((h) => hasKeyword(text, h.trim()));
  const wantsNode = NODE_HINTS.some((h) => hasKeyword(text, h.trim()));
  const matched = matchedKeywords(text);
  // Deterministic ranking: score, then number of keyword hits, then id (never TEMPLATES order).
  const ranked = TEMPLATES.map((t) => ({ t, ...score(t, text, matched, wantsPython, wantsNode) }))
    .sort((a, b) => b.total - a.total || b.hits - a.hits || (a.t.id < b.t.id ? -1 : 1));
  const best = ranked[0].t;
  const bestScore = ranked[0].total;
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
