import { MCP_SCOPES } from "@/lib/mcp/auth";
import { SITE_URL } from "@/lib/docs";

/** OpenAPI 3.1 description of DevStack's public HTTP APIs (site + MCP discovery). */
export function openApiSpec(site = SITE_URL) {
  const scopes = [...MCP_SCOPES];
  return {
    openapi: "3.1.0",
    info: {
      title: "DevStack (NVX Stack Builder) API",
      version: "0.8.0",
      description:
        "Public HTTP APIs for DevStack at devstack.bid. Setup commands are returned as text only; the server does not execute user commands. MCP Streamable HTTP lives at /mcp (JSON-RPC). Create Bearer keys at /settings/mcp.",
    },
    servers: [{ url: site }],
    tags: [
      { name: "plan", description: "AI stack planner (offline, Hugging Face, or OpenAI)" },
      { name: "mcp", description: "Model Context Protocol (Streamable HTTP JSON-RPC)" },
      { name: "meta", description: "Discovery and agent indexes" },
    ],
    paths: {
      "/api/plan": {
        get: {
          operationId: "getPlanCapabilities",
          summary: "Report which planner providers are configured on the server",
          tags: ["plan"],
          responses: {
            "200": {
              description: "Provider summary",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      serverKeyConfigured: { type: "boolean" },
                      provider: { type: "string", enum: ["huggingface", "openai", "offline"] },
                      model: { type: "string" },
                    },
                    required: ["serverKeyConfigured", "provider"],
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: "createPlan",
          summary: "Generate a bilingual stack plan from a natural-language prompt",
          description: "Returns structured steps only. Optional header x-openai-key supplies a user OpenAI key for this request.",
          tags: ["plan"],
          security: [{ bearerMcp: ["plan:write"] }, {}],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    prompt: { type: "string", maxLength: 8000 },
                    lang: { type: "string", enum: ["en", "th"] },
                    mode: { type: "string", enum: ["auto", "fallback"] },
                  },
                  required: ["prompt"],
                },
              },
            },
          },
          responses: {
            "200": { description: "AgentPlan JSON" },
            "400": { $ref: "#/components/responses/ApiError" },
            "413": { $ref: "#/components/responses/ApiError" },
            "415": { $ref: "#/components/responses/ApiError" },
            "429": { $ref: "#/components/responses/ApiError" },
            "504": { $ref: "#/components/responses/ApiError" },
          },
        },
      },
      "/mcp": {
        post: {
          operationId: "mcpJsonRpc",
          summary: "MCP Streamable HTTP JSON-RPC endpoint",
          tags: ["mcp"],
          security: [{ bearerMcp: scopes }],
          parameters: [
            { name: "Accept", in: "header", required: true, schema: { type: "string" }, description: "Must include application/json and text/event-stream" },
            { name: "MCP-Protocol-Version", in: "header", schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": { description: "JSON-RPC result or SSE stream" },
            "202": { description: "Notification accepted" },
            "400": { $ref: "#/components/responses/ApiError" },
            "403": { $ref: "#/components/responses/ApiError" },
            "406": { $ref: "#/components/responses/ApiError" },
            "415": { $ref: "#/components/responses/ApiError" },
          },
        },
      },
      "/llms.txt": {
        get: {
          operationId: "getLlmsIndex",
          summary: "Agent documentation index (llmstxt.org format)",
          tags: ["meta"],
          responses: {
            "200": { description: "Plain-text index of raw Markdown doc URLs", content: { "text/plain": { schema: { type: "string" } } } },
          },
        },
      },
      "/.well-known/mcp": {
        get: {
          operationId: "getMcpDiscovery",
          summary: "MCP server discovery document",
          tags: ["mcp", "meta"],
          responses: { "200": { description: "JSON discovery metadata" } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerMcp: {
          type: "oauth2",
          description: "Self-serve MCP Bearer keys from /settings/mcp (nvx_live_…)",
          flows: {
            clientCredentials: {
              tokenUrl: `${site}/api/mcp/keys`,
              scopes: Object.fromEntries(scopes.map((s) => [s, `MCP scope: ${s}`])),
            },
          },
        },
      },
      responses: {
        ApiError: {
          description: "Structured error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: { error: { code: "invalid_json", message: "Invalid JSON", hint: "Send Content-Type: application/json" } },
            },
          },
        },
      },
      schemas: {
        ApiError: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                hint: { type: "string" },
              },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
      },
    },
  } as const;
}
