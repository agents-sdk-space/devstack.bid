/**
 * devstack-sites: the user-site router for *.devstack.bid (separate Worker, never the platform).
 * Routes by hostname to a built deployment stored in R2. Holds no platform secrets and no D1 access.
 */
import { serveSite, type R2BucketLike } from "../src/lib/hosting/serve";

export default {
  async fetch(req: Request, env: { SITES: R2BucketLike; PLATFORM_DOMAIN?: string }): Promise<Response> {
    try {
      return await serveSite(req, env.SITES, env.PLATFORM_DOMAIN || "devstack.bid");
    } catch {
      return new Response("Site temporarily unavailable", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
  },
};
