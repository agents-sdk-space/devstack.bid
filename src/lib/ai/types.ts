import type { AddonId, JsPm, Lang, PyPm, ResolvedStep, StarterFile } from "../types";

/** The structured plan returned by /api/plan (AI or rule-based). */
export interface AgentPlan {
  source: "openai" | "fallback";
  model?: string;
  /** Why the fallback planner was used (no key, API error, rate limit...). */
  fallbackReason?: string;
  lang: Lang;
  templateId: string;
  projectName: string;
  summary: string;
  addons: AddonId[];
  jsPm: JsPm;
  pyPm: PyPm;
  /** Extra steps beyond the template (sanitised, never executed server-side). */
  extraSteps: ResolvedStep[];
  fileTree: string[];
  starterFiles: StarterFile[];
  nextSteps: string[];
  warnings: string[];
}
