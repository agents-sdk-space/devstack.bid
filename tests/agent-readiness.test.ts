import { describe, expect, it } from "vitest";
import { wantsMarkdown, markdownResponse } from "@/lib/agent/accept";
import { homeMarkdown, notFoundMarkdown } from "@/lib/agent/markdown-pages";
import { isKnownApiPath } from "@/lib/agent/api-paths";
import { isKnownSitePath } from "@/lib/agent/site-paths";
import { openApiSpec } from "@/lib/agent/openapi";
import { llmsTxt } from "@/lib/docs";
import { GET as openApiGET } from "@/app/openapi.json/route";
import { GET as oauthAS } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as oauthPRM } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as mcpDiscovery } from "@/app/.well-known/mcp/route";
import { GET as mcpGet } from "@/app/mcp/route";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("agent markdown negotiation", () => {
  it("detects Accept: text/markdown", () => {
    expect(wantsMarkdown(new Request("http://x/", { headers: { Accept: "text/markdown" } }))).toBe(true);
    expect(wantsMarkdown(new Request("http://x/", { headers: { Accept: "text/html" } }))).toBe(false);
  });

  it("returns Vary: Accept on markdown responses", () => {
    const res = markdownResponse("# hi");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("vary")).toBe("Accept");
    expect((homeMarkdown() + notFoundMarkdown("/nope")).length).toBeGreaterThan(40);
  });

  it("middleware serves homepage markdown and 404 markdown", () => {
    const home = middleware(new NextRequest("http://devstack.bid/", { headers: { Accept: "text/markdown" } }));
    expect(home?.status).toBe(200);
    expect(home?.headers.get("content-type")).toContain("text/markdown");
    const missing = middleware(new NextRequest("http://devstack.bid/__ora-404-probe-xyz", { headers: { Accept: "text/markdown" } }));
    expect(missing?.status).toBe(404);
  });
});

describe("openapi and oauth metadata", () => {
  it("publishes OpenAPI with scoped security", async () => {
    const spec = openApiSpec();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/api/plan"]).toBeDefined();
    const oauth = spec.components.securitySchemes.bearerMcp as { flows: { clientCredentials: { scopes: Record<string, string> } } };
    expect(Object.keys(oauth.flows.clientCredentials.scopes).length).toBeGreaterThan(3);
    const res = await openApiGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.info.title).toContain("DevStack");
  });

  it("exposes OAuth authorization-server and protected-resource metadata", async () => {
    const as = await (await oauthAS()).json();
    expect(as.scopes_supported).toContain("plan:write");
    const prm = await (await oauthPRM()).json();
    expect(prm.resource).toContain("/mcp");
    expect(prm.scopes_supported).toContain("chat:read");
  });
});

describe("MCP discovery handshake", () => {
  it("returns JSON from GET /mcp and enriched well-known manifest", async () => {
    const get = await mcpGet(new Request("http://x/mcp"));
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.transport).toBe("streamable-http");
    const disc = await (await mcpDiscovery()).json();
    expect(disc.transports[0].url).toContain("/mcp");
    expect(disc.openapi).toContain("openapi.json");
  });
});

describe("agent indexes", () => {
  it("llms.txt includes when-to-use guidance", () => {
    const txt = llmsTxt("https://devstack.bid");
    expect(txt).toContain("When to use DevStack");
    expect(txt).toContain("agent-instructions.txt");
  });

  it("classifies unknown API paths", () => {
    expect(isKnownApiPath("/api/plan")).toBe(true);
    expect(isKnownApiPath("/api/not-real")).toBe(false);
    expect(isKnownSitePath("/about")).toBe(true);
    expect(isKnownSitePath("/totally-unknown-path")).toBe(false);
  });
});

describe("route coverage", () => {
  it("every API route and page is known to the middleware", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { isKnownApiPath } = await import("@/lib/agent/api-paths");
    const { isKnownSitePath } = await import("@/lib/agent/site-paths");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const files = walk("src/app").filter((f) => /\/(page\.tsx|route\.ts)$/.test(f));
    for (const f of files) {
      if (f.includes("[...")) continue;
      const path = (f.replace(/^src\/app/, "").replace(/\/(page\.tsx|route\.ts)$/, "") || "/").replace(/\[[^\]]+\]/g, "x");
      if (path.startsWith("/templates/") || path.startsWith("/plugins/")) continue;
      if (path.startsWith("/api/")) expect(isKnownApiPath(path), path).toBe(true);
      else expect(isKnownSitePath(path), path).toBe(true);
    }
  });
});

describe("markdown cache headers", () => {
  it("markdown variants are private so shared caches never serve them to browsers", () => {
    const res = markdownResponse("# x");
    expect(res.headers.get("cache-control")).toMatch(/^private/);
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
