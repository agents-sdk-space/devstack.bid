import { z } from "zod";
import { AgentsApi } from "@/lib/chat/agents-api";
import { execServerCommand, FACTORY_MODELS, factoryAgentBody, factoryEnvironment } from "@/lib/chat/agent-config";
import { upstreamMessage } from "@/lib/chat/factory";
import { factoryContext } from "@/lib/chat/factory-route";
import { json } from "@/lib/chat/runtime";
import { createConversation, ensureUser } from "@/lib/chat/store";
import { HttpError, readJsonBody } from "@/lib/server/http";

/**
 * POST /api/factory/session   (header X-OpenAI-Key: the user's own key, used for this call only)
 * { template: "orchestrator"|"blank", model, environment: "openai_hosted"|"self_hosted",
 *   instructions?, workspaceDirectory? }
 * Creates an agent and a session in the user's account and a local conversation that points at
 * it. For self_hosted, returns the environment id + remote URL and the exec-server command.
 */
const bodySchema = z.object({
  template: z.enum(["orchestrator", "blank"]).default("orchestrator"),
  model: z.enum(FACTORY_MODELS).default("gpt-6.1-sol"),
  environment: z.enum(["openai_hosted", "self_hosted"]).default("openai_hosted"),
  instructions: z.string().max(8000).optional(),
  workspaceDirectory: z
    .string()
    .trim()
    .regex(/^\/[\w./-]{1,200}$/)
    .refine((p) => !p.includes(".."))
    .optional(),
});

export async function POST(req: Request) {
  const ctx = await factoryContext(req, "session");
  if (ctx instanceof Response) return ctx;
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await readJsonBody(req, 16 * 1024));
    if (!parsed.success) return json({ error: "Invalid settings. / การตั้งค่าไม่ถูกต้อง", code: "invalid" }, 400, ctx.cookie);
    body = parsed.data;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request" }, err instanceof HttpError ? err.status : 400, ctx.cookie);
  }

  const api = new AgentsApi(ctx.key);
  try {
    const agent = await api.createAgent(factoryAgentBody(body.template, body.model, body.instructions));
    const session = await api.createSession({
      agent_id: agent.id,
      environment: factoryEnvironment(body.environment, body.workspaceDirectory),
      metadata: { app: "devstack-sandbox-factory" },
    });
    await ensureUser(ctx.db, ctx.uid);
    const title = `${body.template === "orchestrator" ? "Orchestrator" : "Blank agent"} · ${body.model} · ${body.environment === "self_hosted" ? "self-hosted" : "OpenAI-hosted"}`;
    const conversationId = await createConversation(ctx.db, ctx.uid, title, body.model, { source: "factory", environment: body.environment, agentSessionId: session.id });
    const env = session.environment ?? {};
    const selfHosted =
      body.environment === "self_hosted" && env.remote_url && env.id
        ? { environmentId: env.id, remoteUrl: env.remote_url, workspaceDirectory: env.workspace_directory ?? body.workspaceDirectory, command: execServerCommand(env.remote_url, env.id) }
        : undefined;
    console.warn(JSON.stringify({ at: "api/factory/session", event: "created", template: body.template, model: body.model, environment: body.environment }));
    return json({ conversationId, agentId: agent.id, sessionId: session.id, title, model: body.model, template: body.template, environment: body.environment, selfHosted }, 200, ctx.cookie);
  } catch (err) {
    const m = upstreamMessage(err);
    console.warn(JSON.stringify({ at: "api/factory/session", event: "upstream_error", status: m.status, code: m.code }));
    return json({ error: m.message, code: m.code }, m.status, ctx.cookie);
  }
}
