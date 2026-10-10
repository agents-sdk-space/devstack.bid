import { TEMPLATE_IDS } from "@/data/templates";
import { ADDON_IDS } from "../types";

/** JSON Schema for OpenAI Structured Outputs (strict mode: every property required, no extras). */
export function planJsonSchema() {
  const str = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "templateId",
      "projectName",
      "summary",
      "addons",
      "packageManager",
      "pythonPackageManager",
      "extraSteps",
      "fileTree",
      "starterFiles",
      "nextSteps",
    ],
    properties: {
      templateId: { type: "string", enum: TEMPLATE_IDS, description: "Closest matching NVX stack template id." },
      projectName: { type: "string", description: "kebab-case folder/package name, max 40 chars." },
      summary: { type: "string", description: "2-4 sentence explanation of the chosen stack and why." },
      addons: { type: "array", items: { type: "string", enum: [...ADDON_IDS] } },
      packageManager: { type: "string", enum: ["npm", "pnpm", "yarn"] },
      pythonPackageManager: { type: "string", enum: ["pip", "uv"] },
      extraSteps: {
        type: "array",
        description: "0-6 additional steps beyond the template (e.g. install a DB client). Exact, current, non-interactive commands only.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "explanation", "commands", "verify"],
          properties: {
            title: str,
            explanation: str,
            commands: { type: "array", items: str },
            verify: { type: "string", description: "Command that proves the step worked, or empty string." },
          },
        },
      },
      fileTree: { type: "array", items: str, description: "Project file tree lines, indented with two spaces per level, max 40 lines." },
      starterFiles: {
        type: "array",
        description: "1-4 key starter files with complete, working content (relative paths).",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "content"],
          properties: { path: str, content: str },
        },
      },
      nextSteps: { type: "array", items: str, description: "3-6 concrete next steps." },
    },
  } as const;
}
