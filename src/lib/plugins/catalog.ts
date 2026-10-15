import snapshot from "@/data/plugin-catalog.json";

/** One catalog entry. Metadata only: DevStack never installs or runs plugins. */
export type Plugin = {
  name: string;
  description: string;
  category: string;
  homepage: string;
  source: string;
  keywords: string[];
};

export const PLUGIN_SOURCE: { repo: string; commit: string; license: string; url: string } = snapshot.source;
export const PLUGINS: readonly Plugin[] = snapshot.plugins;
export const PLUGIN_CATEGORIES: readonly string[] = [...new Set(PLUGINS.map((p) => p.category))].sort();

export function getPlugin(name: string): Plugin | undefined {
  return PLUGINS.find((p) => p.name === name);
}

/** "owner/repo" from a GitHub source URL. */
export function repoSlug(source: string): string {
  return source.replace(/^https:\/\/github\.com\//, "");
}
