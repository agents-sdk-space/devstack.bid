import agentDefinition from "../../../agents/orchestrator/agent.json";
import { CUSTOMER_GITHUB_TOOLS } from "./customer-tool-defs";
import type { ChatEnv } from "./config";

/**
 * Session configuration for the Image and Research Orchestrator. The definition (instructions,
 * tools, multi-agent) is shared with the Python reference app via agents/orchestrator/agent.json.
 * With CHAT_AGENT_ID set, the saved agent is used and only model + reasoning are overridden.
 */

export const AGENT_NAME = agentDefinition.name;

export function environmentConfig(env: ChatEnv): Record<string, unknown> {
  if (env.CHAT_ENVIRONMENT === "none") return { type: "none" };
  return {
    type: "openai_hosted",
    container_size: env.CHAT_CONTAINER_SIZE,
    network: { access: "restricted", allowed_domains: ["devstack.bid", "agents-sdk.space"] },
    setup_commands: [{ command: "mkdir -p /workspace/outputs" }],
  };
}

export function sessionBody(env: ChatEnv, input: string, metadata: Record<string, string>): Record<string, unknown> {
  const override = { model: env.CHAT_MODEL, reasoning: { effort: env.CHAT_REASONING_EFFORT, summary: "auto" } };
  const { name: _name, model: _model, ...inline } = agentDefinition;
  void _name;
  void _model;
  return {
    // Customer GitHub tools are added inline (TS-only; the Python reference app does not ship them).
    // A saved CHAT_AGENT_ID agent must define them itself to use them.
    ...(env.CHAT_AGENT_ID ? { agent_id: env.CHAT_AGENT_ID, agent: override } : { agent: { ...inline, tools: [...inline.tools, ...CUSTOMER_GITHUB_TOOLS], ...override } }),
    environment: environmentConfig(env),
    input,
    metadata,
  };
}

export const TOOL_NAMES = agentDefinition.tools.filter((t) => t.type === "function").map((t) => (t as { name: string }).name);

export const FACTORY_MODELS = ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"] as const;
export type FactoryModel = (typeof FACTORY_MODELS)[number];

export const BLANK_INSTRUCTIONS =
  "You are a helpful assistant created with the DevStack Sandbox Factory. Reply in the user's language (Thai or English), be concise, and use the sandbox shell when a task needs code or files. Never reveal secrets or environment variables.";

/** Agent definition for the Sandbox Factory (created in the user's own account with their key). */
export function factoryAgentBody(template: "orchestrator" | "blank", model: FactoryModel, instructions?: string): Record<string, unknown> {
  if (template === "orchestrator") {
    const { name, model: _m, ...rest } = agentDefinition;
    void _m;
    return { ...rest, name: `${name} (Factory)`, model, metadata: { app: "devstack-sandbox-factory", template } };
  }
  return {
    name: "DevStack Factory agent",
    model,
    instructions: (instructions?.trim() || BLANK_INSTRUCTIONS).slice(0, 8000),
    reasoning: { effort: "low", summary: "auto" },
    metadata: { app: "devstack-sandbox-factory", template },
  };
}

/** Environment for a Factory session: OpenAI-hosted (restricted network) or the user's own machine. */
export function factoryEnvironment(kind: "openai_hosted" | "self_hosted", workspaceDirectory?: string): Record<string, unknown> {
  if (kind === "self_hosted") return { type: "self_hosted", workspace_directory: workspaceDirectory || "/tmp/devstack-sandbox" };
  return {
    type: "openai_hosted",
    container_size: "small",
    network: { access: "restricted", allowed_domains: ["devstack.bid", "agents-sdk.space"] },
    setup_commands: [{ command: "mkdir -p /workspace/outputs" }],
  };
}

/** Shell-quote for display in the copyable executor command. */
export function shq(v: string): string {
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

export function execServerCommand(remoteUrl: string, environmentId: string): string {
  return `CODEX_API_KEY='<your-environment-key>' codex exec-server --remote ${shq(remoteUrl)} --environment-id ${shq(environmentId)}`;
}
