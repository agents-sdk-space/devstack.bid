import { describe, expect, it } from "vitest";
import { MCP_SCOPES, hashMcpKey, mintMcpKey } from "@/lib/mcp/auth";
import { callTool, handleMcpMessage, hasAllowedOrigin, MCP_TOOLS, parseMcpBody, readResource, PROTOCOL_VERSION } from "@/lib/mcp/server";

describe("remote MCP interface", () => {
  it("advertises the same complete tool catalog served by tools/list", async () => {
    const response = await handleMcpMessage(new Request("https://devstack.bid/mcp"), { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(MCP_TOOLS.map((tool) => tool.name));
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toContain("github_commit_file");
  });

  it("provides privacy-preserving Thai safety recommendations without personal input", async () => {
    const guidance = await callTool(new Request("https://devstack.bid/mcp"), "get_safety_recommendations", { topic: "privacy", lang: "th" });
    expect(guidance.structuredContent).toMatchObject({ topic: "privacy", title: "พื้นฐานความเป็นส่วนตัว" });
    expect(JSON.stringify(guidance.structuredContent)).toContain("ไม่รับหรือเก็บรายละเอียดส่วนบุคคล");
  });

  it("rejects unsupported safety topics", async () => {
    const guidance = await callTool(new Request("https://devstack.bid/mcp"), "get_safety_recommendations", { topic: "track-user" });
    expect(guidance.isError).toBe(true);
  });

  it("negotiates a supported protocol version and reports the server capabilities", async () => {
    const response = await handleMcpMessage(new Request("https://devstack.bid/mcp"), {
      jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION },
    });
    const body = await response.json();
    expect(body.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toBe("devstack-bid");
  });

  it("serves platform docs and templates as resources", async () => {
    const platform = await readResource("devstack://platform");
    const templates = await readResource("devstack://templates");
    expect(platform.contents[0].text).toContain("Platform functions");
    expect(JSON.parse(templates.contents[0].text)).toHaveLength(11);
  });

  it("accepts trusted site and localhost browser origins and rejects foreign origins", () => {
    expect(hasAllowedOrigin(new Request("https://devstack.bid/mcp"))).toBe(true);
    expect(hasAllowedOrigin(new Request("https://devstack.bid/mcp", { headers: { Origin: "https://devstack.bid" } }))).toBe(true);
    expect(hasAllowedOrigin(new Request("https://devstack.bid/mcp", { headers: { Origin: "http://localhost:5173" } }))).toBe(true);
    expect(hasAllowedOrigin(new Request("https://devstack.bid/mcp", { headers: { Origin: "https://attacker.example" } }))).toBe(false);
  });

  it("accepts bounded JSON-RPC payloads and produces unguessable, hashable keys", async () => {
    expect(parseMcpBody({ jsonrpc: "2.0", method: "ping" })).not.toBeNull();
    expect(parseMcpBody(Array.from({ length: 21 }, () => ({ jsonrpc: "2.0", method: "ping" })))).toBeNull();
    const key = await mintMcpKey();
    expect(key).toMatch(/^nvx_live_[A-Za-z0-9_-]{43}$/);
    expect(await hashMcpKey(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(MCP_SCOPES).toContain("factory:write");
  });
});
