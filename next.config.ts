import type { NextConfig } from "next";
import { KNOWN_TEMPLATE_IDS } from "./src/data/template-ids";
import { securityHeaders } from "./src/lib/security-headers";

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
    return {
      beforeFiles: [{ source: `/templates/:id((?!(?:${known})$)[^/]+)`, destination: "/__nvx_not_found" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(isDev) }];
  },
};

export default nextConfig;

// Makes Cloudflare bindings (rate limiters, env) available to `next dev` via getCloudflareContext().
if (isDev) {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev()).catch(() => {});
}
