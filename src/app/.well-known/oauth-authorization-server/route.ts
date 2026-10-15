import { MCP_SCOPES } from "@/lib/mcp/auth";
import { SITE_URL } from "@/lib/docs";

/** RFC 8414 metadata for DevStack MCP Bearer keys (self-serve at /settings/mcp). */
export async function GET() {
  return Response.json(
    {
      issuer: SITE_URL,
      authorization_endpoint: `${SITE_URL}/login`,
      token_endpoint: `${SITE_URL}/api/mcp/keys`,
      registration_endpoint: `${SITE_URL}/settings/mcp`,
      scopes_supported: [...MCP_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      code_challenge_methods_supported: ["S256"],
      service_documentation: `${SITE_URL}/docs/integrations/mcp`,
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } }
  );
}
