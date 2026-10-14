import { HttpError, readJsonBody } from "@/lib/server/http";
import { handleMcpMessage, hasAllowedOrigin, jsonHeaders, MAX_RPC_BODY, parseMcpBody } from "@/lib/mcp/server";

const bad = (status: number, message: string) => Response.json({ error: message }, { status, headers: jsonHeaders });

export async function POST(req: Request) {
  if (!hasAllowedOrigin(req)) return bad(403, "Origin is not allowed.");
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return bad(415, "Content-Type must be application/json.");
  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return bad(406, "Accept must include application/json and text/event-stream.");
  try {
    const parsed = parseMcpBody(await readJsonBody(req, MAX_RPC_BODY));
    if (!parsed) return bad(400, "Invalid JSON-RPC message.");
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
    if (error instanceof HttpError) return bad(error.status, error.message);
    return bad(400, "Invalid MCP request.");
  }
}

export async function GET(req: Request) {
  if (!hasAllowedOrigin(req)) return bad(403, "Origin is not allowed.");
  return new Response("MCP endpoint accepts JSON-RPC POST requests.", { status: 405, headers: { Allow: "POST", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
