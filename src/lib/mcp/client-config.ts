/** Copy-ready MCP client configuration. Shared by /settings/mcp and the tests; no server-only imports. */

export const MCP_ENDPOINT = "https://devstack.bid/mcp";

/** Placeholder shown before a key exists. It is not a real key shape that the server accepts. */
export const KEY_PLACEHOLDER = "nvx_live_REPLACE_WITH_YOUR_KEY";

export const MCP_SERVER_NAME = "devstack";

/**
 * Entry for Cline's `cline_mcp_settings.json`.
 * Cline needs `"type": "streamableHttp"` for a remote Streamable HTTP server; without it Cline assumes a
 * local stdio server and fails to connect. The hyphenated `streamable-http` is not accepted by Cline.
 */
export function clineConfig(key: string = KEY_PLACEHOLDER): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          type: "streamableHttp",
          url: MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${key}` },
          disabled: false,
          autoApprove: [],
        },
      },
    },
    null,
    2,
  );
}
