import type { Metadata } from "next";
import { PluginCatalog } from "@/components/plugins/plugin-catalog";
import { T } from "@/components/prefs";

export const metadata: Metadata = { title: "Plugins", description: "MCP servers and plugins you can connect to your AI tools." };

export default function PluginsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-4xl font-bold tracking-tighter text-fg sm:text-5xl">
        <T k="plugins.title" />
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        <T k="plugins.subtitle" />
      </p>
      <div className="mt-8">
        <PluginCatalog />
      </div>
    </div>
  );
}
