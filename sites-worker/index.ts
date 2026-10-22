/**
 * devstack-sites: the user-site router for *.devstack.bid (separate Worker, never the platform).
 * Routes by hostname to a built deployment stored in R2. Holds no D1 access; its only secret is SITES_PROXY_SECRET (derives per-site proxy keys, never sent to the client).
 */
import { serveSite, unavailable, type R2BucketLike } from "../src/lib/hosting/serve";
import { proxyKey } from "../src/lib/hosting/server-worker";

export default {
  async fetch(req: Request, env: { SITES: R2BucketLike; PLATFORM_DOMAIN?: string; WORKERS_SUBDOMAIN?: string; SITES_PROXY_SECRET?: string }): Promise<Response> {
    const domain = env.PLATFORM_DOMAIN || "devstack.bid";
    const u = new URL(req.url);
    // The *.devstack.bid route also captures www; send it to the platform apex.
    if (u.hostname === `www.${domain}`) {
      u.hostname = domain;
      return Response.redirect(u.toString(), 301);
    }
    try {
      return await serveSite(req, env.SITES, env.PLATFORM_DOMAIN || "devstack.bid", {
        workersSubdomain: env.WORKERS_SUBDOMAIN,
        proxyKeyFor: async (w) => (env.SITES_PROXY_SECRET ? proxyKey(env.SITES_PROXY_SECRET, w) : null),
      });
    } catch {
      return unavailable(503);
    }
  },
};
