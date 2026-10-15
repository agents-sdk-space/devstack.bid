import { SITE_URL } from "@/lib/docs";

export async function GET() {
  const text = `# DevStack agent instructions

## When to use DevStack

- Generate ordered npm/pip setup scripts from templates or natural language (Builder + /api/plan + MCP compose_stack).
- Look up Agents SDK / DevStack docs via MCP search_docs or /llms.txt raw Markdown URLs.
- Run free-tier chat (/chat) or agent sandbox (/chat/dev, /factory) when the user needs interactive help — not for executing shell commands on the server.

## How to call

1. Read ${SITE_URL}/llms.txt for documentation URLs.
2. Read ${SITE_URL}/openapi.json for HTTP operations and OAuth scopes.
3. Connect MCP at ${SITE_URL}/mcp (discovery: ${SITE_URL}/.well-known/mcp). Mint keys at ${SITE_URL}/settings/mcp.

## Do not

- Expect the server to run user shell commands.
- Send secrets in prompts; use scoped MCP keys instead.
`;
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
