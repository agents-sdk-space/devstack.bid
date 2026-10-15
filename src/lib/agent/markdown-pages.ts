import { SITE_URL } from "@/lib/docs";

export function homeMarkdown(site = SITE_URL): string {
  return `# NVX Stack Builder (DevStack)

> ${site} turns npm, npx, pip and PyPI setup into ordered, bilingual Stack Templates you review and run yourself. The server never executes your commands.

## When to use DevStack

Use DevStack when an agent or developer needs **runnable setup plans** for Node.js or Python projects: pick a template, compose steps in the Builder, export \`setup.sh\` / \`setup.ps1\`, or call the MCP tools (\`list_templates\`, \`compose_stack\`, \`export_scripts\`). Use **User Chat** (\`/chat\`) for free-tier Workers AI Q&A; **Dev Chat** (\`/chat/dev\`) for sandbox agents; **MCP** (\`${site}/mcp\`) for scripted integration without rebuilding HTTP clients.

## Start here

- [Documentation index](${site}/docs)
- [Platform function index (Markdown)](${site}/docs/platform.md)
- [Agent index llms.txt](${site}/llms.txt)
- [OpenAPI specification](${site}/openapi.json)
- [MCP discovery](${site}/.well-known/mcp)

## Product areas

| Area | URL |
|------|-----|
| Templates | ${site}/templates |
| Builder | ${site}/builder |
| User Chat | ${site}/chat |
| Dev Chat | ${site}/chat/dev |
| MCP settings (API keys) | ${site}/settings/mcp |
`;
}

export function notFoundMarkdown(pathname: string, site = SITE_URL): string {
  return `# 404 Not Found

The path \`${pathname}\` does not exist on DevStack (${site}).

## Where to go next

- [Home](${site}/)
- [Documentation](${site}/docs)
- [llms.txt agent index](${site}/llms.txt)
- [OpenAPI](${site}/openapi.json)
- [Sitemap](${site}/sitemap.xml)

If you expected an API route, read \`${site}/openapi.json\` for supported paths and error shapes.
`;
}
