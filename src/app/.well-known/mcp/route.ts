import { SITE_URL } from "@/lib/docs";

export async function GET() {
  return Response.json({
    name: "NVX Stack Builder MCP",
    description: "Tools for DevStack templates, setup planning, documentation, privacy and personal-safety recommendations, chat, sandbox sessions, and GitHub integration.",
    endpoint: `${SITE_URL}/mcp`,
    transport: "streamable-http",
    protocolVersions: ["2025-11-25", "2025-06-18", "2025-03-26"],
    authentication: {
      type: "bearer",
      keyPage: `${SITE_URL}/settings/mcp`,
      header: "Authorization: Bearer nvx_live_…",
      scopes: ["plan:write", "chat:read", "chat:write", "dev:write", "factory:write", "github:read", "github:write"],
    },
    documentation: `${SITE_URL}/docs/integrations/mcp`,
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
