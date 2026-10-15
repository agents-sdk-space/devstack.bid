import type { MetadataRoute } from "next";
import { DOCS, pagePath, SITE_URL } from "@/lib/docs";
import { TEMPLATE_IDS } from "@/data/templates";
import { PLUGINS } from "@/lib/plugins/catalog";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/about", "/contact", "/privacy", "/learn", "/templates", "/builder", "/chat", "/chat/dev", "/factory", "/studio/", "/docs", "/design", "/login", "/plugins", "/settings/mcp"];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}` })),
    ...TEMPLATE_IDS.map((id) => ({ url: `${SITE_URL}/templates/${id}` })),
    ...PLUGINS.map((p) => ({ url: `${SITE_URL}/plugins/${p.name}` })),
    ...DOCS.filter((d) => d.slug).map((d) => ({ url: `${SITE_URL}${pagePath(d.slug)}` })),
  ];
}
