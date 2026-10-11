import type { MetadataRoute } from "next";
import { DOCS, pagePath, SITE_URL } from "@/lib/docs";
import { TEMPLATE_IDS } from "@/data/templates";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/templates", "/builder", "/chat", "/chat/dev", "/factory", "/studio/", "/docs", "/design"];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}` })),
    ...TEMPLATE_IDS.map((id) => ({ url: `${SITE_URL}/templates/${id}` })),
    ...DOCS.filter((d) => d.slug).map((d) => ({ url: `${SITE_URL}${pagePath(d.slug)}` })),
  ];
}
