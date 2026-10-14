import { describe, expect, it } from "vitest";
import { GET as discovery } from "@/app/.well-known/mcp/route";
import { clineConfig, KEY_PLACEHOLDER, MCP_ENDPOINT, MCP_SERVER_NAME } from "@/lib/mcp/client-config";

describe("Cline MCP configuration", () => {
  it("emits a Streamable HTTP entry that Cline accepts", () => {
    const entry = JSON.parse(clineConfig()).mcpServers[MCP_SERVER_NAME];
    expect(entry.type).toBe("streamableHttp");
    expect(entry.url).toBe(MCP_ENDPOINT);
    expect(entry.headers.Authorization).toBe(`Bearer ${KEY_PLACEHOLDER}`);
    // Cline asks before every tool call unless a tool is listed here.
    expect(entry.autoApprove).toEqual([]);
    expect(entry.disabled).toBe(false);
  });

  it("puts a freshly minted key in the Authorization header and nowhere else", () => {
    const key = "nvx_live_" + "a".repeat(43);
    const text = clineConfig(key);
    expect(JSON.parse(text).mcpServers[MCP_SERVER_NAME].headers.Authorization).toBe(`Bearer ${key}`);
    expect(text.split(key)).toHaveLength(2);
  });

  it("points at the same endpoint the server advertises", async () => {
    const body = await discovery().json();
    expect(body.endpoint).toBe(MCP_ENDPOINT);
    expect(body.clients.cline.configType).toBe("streamableHttp");
  });
});
