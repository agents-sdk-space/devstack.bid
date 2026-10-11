import { z } from "zod";
import { planFallback } from "@/lib/ai/fallback";
import { getTemplate } from "@/data/templates";
import { composeSteps, configForTemplate, flattenCommands } from "@/lib/composer";
import { encodeShare } from "@/lib/share";
import { cleanText } from "@/lib/sanitize";
import type { Lang } from "@/lib/types";

/**
 * Server-side implementation of the agent's `generate_ai_agents_website` function tool.
 * Deterministic: it reuses the rule-based Stack Builder planner and templates, so it costs no
 * extra model calls. Shared by the Worker chat route and `scripts/site-plan.ts` (Python app).
 */

const list = (max: number) => z.array(z.string()).max(50).transform((a) => a.map((s) => cleanText(s, 120)).filter(Boolean).slice(0, max));

export const sitePlanInput = z.object({
  site_name: z.string().transform((s) => cleanText(s, 80)).pipe(z.string().min(1)),
  primary_functions: list(8).pipe(z.array(z.string()).min(1)),
  design_theme: z.string().transform((s) => cleanText(s, 120)),
  user_roles: list(6),
  integration_services: list(8),
});
export type SitePlanInput = z.infer<typeof sitePlanInput>;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const envName = (s: string) =>
  `${s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "SERVICE"}_API_KEY`;

const hasThai = (s: string) => /[\u0E00-\u0E7F]/.test(s);

export interface SitePlan {
  site_name: string;
  design_theme: string;
  stack: { template_id: string; template_name: string; summary: string; template_url: string; builder_url: string; project_name: string };
  pages: { path: string; title: string; purpose: string }[];
  agents: { name: string; responsibility: string; suggested_tools: string[]; used_by: string[] }[];
  user_roles: { role: string; can: string[] }[];
  integrations: { service: string; env_var: string; note: string }[];
  setup_commands: string[];
  file_tree: string[];
  next_steps: string[];
  notes: string[];
}

function toolsFor(fn: string): string[] {
  const t = fn.toLowerCase();
  const tools = new Set<string>();
  if (/(image|ภาพ|รูป|photo|art|design)/.test(t)) tools.add("image_generation");
  if (/(search|research|ค้นหา|วิจัย|news|ข่าว|find)/.test(t)) tools.add("web_search");
  if (/(chat|support|ตอบ|ช่วย|faq|assist)/.test(t)) tools.add("conversation_memory (D1)");
  if (/(file|document|เอกสาร|pdf|report|รายงาน)/.test(t)) tools.add("file_storage (R2)");
  if (/(code|โค้ด|deploy|build)/.test(t)) tools.add("sandbox (Agents API environment)");
  if (!tools.size) tools.add("function tools (your API)");
  return [...tools];
}

export function generateSitePlan(raw: unknown, site = "https://devstack.bid"): SitePlan {
  const input = sitePlanInput.parse(raw);
  const lang: Lang = hasThai(JSON.stringify(input)) ? "th" : "en";
  const prompt = `${input.site_name}: AI agents website with ${input.primary_functions.join(", ")}; integrations ${input.integration_services.join(", ")}`;
  const plan = planFallback(prompt, lang, "agent tool");
  const template = getTemplate(plan.templateId)!;
  const projectName = slug(input.site_name) || plan.projectName;
  const config = configForTemplate(template.id, { projectName, addons: plan.addons, jsPm: plan.jsPm, pyPm: plan.pyPm });
  const steps = composeSteps(config);
  const token = encodeShare({ config, edits: { order: [], removed: [], custom: [] } });
  const roles = input.user_roles.length ? input.user_roles : ["guest", "user", "admin"];

  const pages = [
    { path: "/", title: input.site_name, purpose: lang === "th" ? "หน้าแรก: อธิบายสิ่งที่ agent ทำ และปุ่มเริ่มใช้งาน" : "Landing page: what the agents do and a clear start button" },
    ...input.primary_functions.map((fn) => ({
      path: `/app/${slug(fn) || "feature"}`,
      title: fn,
      purpose: lang === "th" ? `หน้าใช้งาน "${fn}" พร้อมสถานะการทำงานของ agent แบบสด` : `Workspace for "${fn}" with live agent progress`,
    })),
    { path: "/history", title: lang === "th" ? "ประวัติ" : "History", purpose: lang === "th" ? "ผลงานและบทสนทนาที่ผ่านมา" : "Past results and conversations" },
  ];
  if (roles.some((r) => /admin|ผู้ดูแล/i.test(r))) {
    pages.push({ path: "/admin", title: "Admin", purpose: lang === "th" ? "ตั้งค่า agent, limit และดูการใช้งาน/ค่าใช้จ่าย" : "Agent settings, limits, usage and cost" });
  }

  return {
    site_name: input.site_name,
    design_theme: input.design_theme || "DevStack black theme",
    stack: {
      template_id: template.id,
      template_name: template.name[lang],
      summary: template.summary[lang],
      template_url: `${site}/templates/${template.id}`,
      builder_url: `${site}/builder#s=${token}`,
      project_name: config.projectName,
    },
    pages,
    agents: [
      {
        name: "Orchestrator",
        responsibility: lang === "th" ? "รับคำขอ วางแผน และแบ่งงานให้ agent ย่อย" : "Receives requests, plans, and delegates to specialist agents",
        suggested_tools: ["multi_agent (subagents)"],
        used_by: roles,
      },
      ...input.primary_functions.map((fn) => ({
        name: `${fn} agent`.slice(0, 80),
        responsibility: fn,
        suggested_tools: toolsFor(fn),
        used_by: roles.filter((r) => !/guest|ผู้เยี่ยมชม/i.test(r)).length ? roles.filter((r) => !/guest|ผู้เยี่ยมชม/i.test(r)) : roles,
      })),
    ],
    user_roles: roles.map((role) => ({
      role,
      can: /admin|ผู้ดูแล/i.test(role)
        ? ["manage agents", "set limits", "view usage"]
        : /guest|ผู้เยี่ยมชม/i.test(role)
          ? ["view landing page", "try a limited demo"]
          : ["use all agent features", "view own history"],
    })),
    integrations: input.integration_services.map((service) => ({
      service,
      env_var: envName(service),
      note: lang === "th" ? "เก็บ key เป็น secret ฝั่งเซิร์ฟเวอร์ ห้ามส่งไปเบราว์เซอร์" : "Keep the key as a server-side secret; never send it to the browser",
    })),
    setup_commands: flattenCommands(steps).slice(0, 14),
    file_tree: plan.fileTree.slice(0, 25),
    next_steps: plan.nextSteps.slice(0, 5),
    notes: [
      lang === "th"
        ? "คำสั่งเป็นข้อความเท่านั้น เซิร์ฟเวอร์ไม่รันคำสั่งใดๆ เปิด builder_url เพื่อปรับขั้นตอนก่อนใช้"
        : "Commands are text only; nothing runs on the server. Open builder_url to adjust the steps before use.",
    ],
  };
}
