import type { Metadata } from "next";
import { McpKeys } from "@/components/mcp-keys";

export const metadata: Metadata = {
  title: "MCP integrations",
  description: "Create and manage scoped API keys for connecting AI platforms to DevStack over MCP.",
};

export default function McpSettingsPage() {
  return <McpKeys />;
}
