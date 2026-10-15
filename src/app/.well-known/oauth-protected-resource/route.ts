import { MCP_SCOPES } from "@/lib/mcp/auth";
import { SITE_URL } from "@/lib/docs";

/** RFC 9728 protected-resource metadata for the MCP HTTP API. */
export async function GET() {
  return Response.json(
    {
      resource: `${SITE_URL}/mcp`,
      authorization_servers: [SITE_URL],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ["header"],
      resource_documentation: `${SITE_URL}/docs/integrations/mcp`,
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } }
  );
}
