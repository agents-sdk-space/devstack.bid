/**
 * Vercel AI Gateway models the chat picker offers.
 * IDs are the exact `provider/model` strings from GET https://ai-gateway.vercel.sh/v1/models
 * (checked 2026-10-14). Unknown ids are rejected; we do not invent model names.
 */

export interface GatewayModel {
  id: string;
  en: string;
  th: string;
}

export const GATEWAY_MODELS: readonly GatewayModel[] = [
  { id: "openai/gpt-5-mini", en: "Gateway · GPT-5 mini", th: "เกตเวย์ · GPT-5 mini" },
  { id: "openai/gpt-5-codex", en: "Gateway · GPT-5 Codex", th: "เกตเวย์ · GPT-5 Codex" },
  { id: "anthropic/claude-haiku-4.5", en: "Gateway · Claude Haiku 4.5", th: "เกตเวย์ · Claude Haiku 4.5" },
  { id: "google/gemini-2.5-flash", en: "Gateway · Gemini 2.5 Flash", th: "เกตเวย์ · Gemini 2.5 Flash" },
  { id: "alibaba/qwen3-coder", en: "Gateway · Qwen3 Coder", th: "เกตเวย์ · Qwen3 Coder" },
  { id: "deepseek/deepseek-v4-flash", en: "Gateway · DeepSeek V4 Flash", th: "เกตเวย์ · DeepSeek V4 Flash" },
];

const IDS = new Set(GATEWAY_MODELS.map((m) => m.id));

export function isGatewayModel(id: string): boolean {
  return IDS.has(id);
}
