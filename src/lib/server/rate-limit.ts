import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { rateLimit as memoryRateLimit } from "@/lib/rate-limit";

/**
 * Rate limiting for /api/plan.
 *
 * On Cloudflare Workers this uses the Workers Rate Limiting API bindings declared in
 * wrangler.jsonc (NVX_PLAN_AI_LIMITER, NVX_PLAN_LIMITER): counters are shared by every isolate
 * in a Cloudflare location and survive restarts. Elsewhere (next dev/start, tests) it falls back
 * to the per-instance in-memory limiter with the same limits.
 */

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type LimiterName = "NVX_PLAN_AI_LIMITER" | "NVX_PLAN_LIMITER" | "NVX_CHAT_LIMITER" | "NVX_FACTORY_LIMITER" | "NVX_STUDIO_LIMITER";

async function binding(name: LimiterName): Promise<RateLimitBinding | null> {
  try {
    // Static import: a dynamic import() of this module fails with "Cannot perform I/O on behalf of
    // a different request" after the first request in an isolate (seen in wrangler preview).
    const env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>;
    const b = env[name] as RateLimitBinding | undefined;
    return b && typeof b.limit === "function" ? b : null;
  } catch {
    return null; // not running on Workers
  }
}

export async function checkRateLimit(name: LimiterName, key: string, fallbackPerMinute: number, opts: { memoryOnly?: boolean } = {}): Promise<{ ok: boolean; backend: "workers" | "memory" }> {
  const b = opts.memoryOnly ? null : await binding(name);
  if (b) {
    try {
      const { success } = await b.limit({ key });
      return { ok: success, backend: "workers" };
    } catch (err) {
      console.error(`[rate-limit] ${name} binding failed, using memory fallback:`, (err as Error)?.name ?? "error");
    }
  }
  return { ok: memoryRateLimit(`${name}:${key}`, fallbackPerMinute, 60_000), backend: "memory" };
}
