import { HttpError, readJsonBody } from "@/lib/server/http";
import { apiError } from "@/lib/server/api-error";
import { handleMcpMessage, hasAllowedOrigin, jsonHeaders, MAX_RPC_BODY, parseMcpBody, PROTOCOL_VERSION } from "@/lib/mcp/server";
import { SITE_URL } from "@/lib/docs";

export async function POST(req: Request) {
  if (!hasAllowedOrigin(req)) return apiError("origin_not_allowed", "Origin is not allowed.", 403, "Call /mcp from a server-side MCP client or from devstack.bid.");
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return apiError("unsupported_media_type", "Content-Type must be application/json.", 415);
  }
  const accept = req.headers.get("accept") ?? "*/*";
  if (!accept.includes("application/json") && !accept.includes("*/*")) {
    return apiError("not_acceptable", "Accept must include application/json.", 406, "Streamable HTTP clients may also send text/event-stream.");
  }
  try {
    const parsed = parseMcpBody(await readJsonBody(req, MAX_RPC_BODY));
    if (!parsed) return apiError("invalid_json_rpc", "Invalid JSON-RPC message.", 400);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    const responses: Response[] = [];
    for (const message of messages) {
      const response = await handleMcpMessage(req, message);
      if (response.status !== 202) responses.push(response);
    }
    if (!responses.length) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
    if (Array.isArray(parsed)) {
      const bodies = await Promise.all(responses.map((response) => response.json()));
      return Response.json(bodies, { headers: jsonHeaders });
    }
    return responses[0];
  } catch (error) {
    if (error instanceof HttpError) return apiError("http_error", error.message, error.status);
    return apiError("invalid_mcp_request", "Invalid MCP request.", 400);
  }
}

export async function GET(req: Request) {
  if (!hasAllowedOrigin(req)) return apiError("origin_not_allowed", "Origin is not allowed.", 403);
  return Response.json(
    {
      name: "devstack-bid",
      transport: "streamable-http",
      protocolVersion: PROTOCOL_VERSION,
      endpoint: `${SITE_URL}/mcp`,
      discovery: `${SITE_URL}/.well-known/mcp`,
      handshake: "POST JSON-RPC initialize to this URL with Content-Type: application/json",
    },
    { headers: { ...jsonHeaders, "Cache-Control": "public, max-age=60" } }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id",
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE() {
  return apiError("method_not_allowed", "MCP endpoint accepts JSON-RPC POST requests.", 405, "Use POST with an initialize JSON-RPC body.");
}
