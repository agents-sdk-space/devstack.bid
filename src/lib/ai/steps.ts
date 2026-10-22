import type { AgentPlan } from "./types";
import { sanitizeStep } from "../sanitize";
import type { ResolvedStep } from "../types";

export function customStepsForPlan(plan: AgentPlan): ResolvedStep[] {
  const custom = [...plan.extraSteps];
  if (plan.source !== "openai" || plan.starterFiles.length === 0) return custom;

  const filesStep = sanitizeStep(
    {
      id: "custom-ai-files",
      title: { en: "Add AI-generated starter files", th: "เพิ่มไฟล์เริ่มต้นที่ AI สร้าง" },
      explanation: {
        en: "Key files proposed by the AI agent. Review them — they may overwrite files created by earlier steps.",
        th: "ไฟล์สำคัญที่ AI agent เสนอ ควรตรวจสอบก่อน เพราะอาจเขียนทับไฟล์จากขั้นตอนก่อนหน้า",
      },
      commands: [],
      files: plan.starterFiles,
      expected: { en: "Starter files are in place.", th: "มีไฟล์เริ่มต้นครบแล้ว" },
    },
    "custom-ai-files"
  );
  if (filesStep) custom.push(filesStep);
  return custom;
}
