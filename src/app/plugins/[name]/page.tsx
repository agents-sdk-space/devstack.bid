import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PluginDetail } from "@/components/plugins/plugin-detail";
import { getPlugin, PLUGINS } from "@/lib/plugins/catalog";

export function generateStaticParams() {
  return PLUGINS.map((p) => ({ name: p.name }));
}

export async function generateMetadata({ params }: PageProps<"/plugins/[name]">): Promise<Metadata> {
  const { name } = await params;
  const plugin = getPlugin(name);
  return plugin ? { title: plugin.name, description: plugin.description } : {};
}

export default async function PluginPage({ params }: PageProps<"/plugins/[name]">) {
  const { name } = await params;
  if (!getPlugin(name)) notFound();
  return <PluginDetail name={name} />;
}
