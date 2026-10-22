/**
 * Fixed-window counters in Workers KV (nvx-stack-builder-kv, binding KV): rate limits and short caches only,
 * never source data. KV is eventually consistent, so this is a soft limit; the hard daily cap is counted in D1.
 * Without the binding (local dev, tests) it falls back to the in-memory limiter.
 */
import { rateLimit } from "@/lib/rate-limit";

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export async function kvRateLimit(kv: KvLike | null, key: string, limit: number, windowSec: number, now = Date.now()): Promise<boolean> {
  if (!kv) return rateLimit(`kv:${key}`, limit, windowSec * 1000, now);
  const bucket = Math.floor(now / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  try {
    const n = Number((await kv.get(k)) ?? 0);
    if (n >= limit) return false;
    await kv.put(k, String(n + 1), { expirationTtl: Math.max(60, windowSec * 2) });
    return true;
  } catch {
    return rateLimit(`kv:${key}`, limit, windowSec * 1000, now);
  }
}

/** Read-only check of the same window (no increment). Without KV it reports room (the consuming check still runs later). */
export async function kvHasRoom(kv: KvLike | null, key: string, limit: number, windowSec: number, now = Date.now()): Promise<boolean> {
  if (!kv) return true;
  try {
    return Number((await kv.get(`rl:${key}:${Math.floor(now / 1000 / windowSec)}`)) ?? 0) < limit;
  } catch {
    return true;
  }
}
