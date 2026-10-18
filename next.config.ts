import type { NextConfig } from "next";
import { KNOWN_TEMPLATE_IDS } from "./src/data/template-ids";
import docsNav from "./src/generated/docs-nav.json";
import { securityHeaders, uiLabContentSecurityPolicy } from "./src/lib/security-headers";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    // Real 404 status for unknown /templates/<id>: with Cache Components + Partial Prefetching the
    // page's notFound() streams after the static shell (status 200). Sending unknown ids to a path
    // no route matches renders the normal not-found page with status 404. No middleware needed.
    const known = KNOWN_TEMPLATE_IDS.map((id) => id.replace(/[-]/g, "\\-")).join("|");
    // Docs: /docs/<slug>.md serves the raw Markdown (route handler under /docs/raw), and unknown
    // /docs/<slug> paths get a real 404 the same way as unknown templates.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
    const docSlugs = docsNav.sections.flatMap((s) => s.pages.map((p) => p.slug)).filter(Boolean).map(esc).join("|");
    const jsonExtras = ["agents/platform-manifest.json", "agents/cursor-agents.json"];
    return {
      beforeFiles: [
        { source: `/templates/:id((?!(?:${known})$)[^/]+)`, destination: "/__nvx_not_found" },
        { source: "/docs.md", destination: "/docs/raw/index" },
        { source: "/docs/:path((?!raw/).+)\\.md", destination: "/docs/raw/:path" },
        ...jsonExtras.map((file) => ({ source: `/docs/${file}`, destination: `/docs/raw/${file}` })),
        { source: `/docs/:path((?!(?:${docSlugs}|${jsonExtras.map(esc).join("|")})$)(?!raw/)(?!.*\\.md$).+)`, destination: "/__nvx_not_found" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    // Canonical host: www.devstack.bid -> devstack.bid (both are Workers Custom Domains of this Worker).
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.devstack.bid" }],
        destination: "https://devstack.bid/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(isDev) },
      // Later entries win for the same key: relax the CSP for the internal Spline demo only.
      { source: "/ui-lab", headers: [{ key: "Content-Security-Policy", value: uiLabContentSecurityPolicy(isDev) }] },
    ];
  },
};

export default nextConfig;

// Makes Cloudflare bindings (rate limiters, env) available to `next dev` via getCloudflareContext().
if (isDev) {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev()).catch(() => {});
}
