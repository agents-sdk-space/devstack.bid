import type { Metadata } from "next";
import { ConnectionsPanel } from "@/components/connections-panel";
import { SettingsNav } from "@/components/settings-nav";

export const metadata: Metadata = {
  title: "Connections",
  description: "Link your own GitHub, Cloudflare and OpenAI accounts to DevStack.",
};

export default function ConnectionsSettingsPage() {
  return (
    <>
      <SettingsNav />
      <ConnectionsPanel />
    </>
  );
}
