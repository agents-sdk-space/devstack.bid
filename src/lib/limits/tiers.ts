/**
 * Per-user tiers for AI chat, builds and deploys. There is no billing/plan table yet, so the tier comes from
 * operator env lists (logins, comma separated): AISITE_ADMIN_LOGINS → admin, DEVSTACK_PAID_LOGINS → paid,
 * everyone else → free. Each number can be overridden with DEVSTACK_TIER_<TIER>_<FIELD> (e.g. DEVSTACK_TIER_FREE_AI_PER_DAY).
 * Daily caps are counted in D1 (hard); hourly burst caps use Workers KV (soft, see kv-limit.ts).
 */
import { isAdmin } from "@/lib/aisite/admin";
import { kvRateLimit, type KvLike } from "@/lib/aisite/kv-limit";

export type Tier = "free" | "paid" | "admin";
export interface TierLimits { aiPerDay: number; aiPerMinute: number; buildsPerHour: number; buildsPerDay: number; deploysPerDay: number }

export const TIER_DEFAULTS: Record<Tier, TierLimits> = {
  free: { aiPerDay: 20, aiPerMinute: 4, buildsPerHour: 3, buildsPerDay: 10, deploysPerDay: 5 },
  paid: { aiPerDay: 200, aiPerMinute: 10, buildsPerHour: 20, buildsPerDay: 60, deploysPerDay: 50 },
  admin: { aiPerDay: 1000, aiPerMinute: 30, buildsPerHour: 60, buildsPerDay: 300, deploysPerDay: 200 },
};

type Env = Record<string, string | undefined>;
const procEnv = (): Env => (typeof process !== "undefined" && process.env ? (process.env as Env) : {});
const inList = (login: string, list: string | undefined) => (list ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(login.toLowerCase());

export function tierFor(login: string | null | undefined, env: Env = procEnv()): Tier {
  if (!login) return "free";
  if (isAdmin(login, env.AISITE_ADMIN_LOGINS ?? "")) return "admin";
  if (inList(login, env.DEVSTACK_PAID_LOGINS)) return "paid";
  return "free";
}

const FIELD: Record<keyof TierLimits, string> = { aiPerDay: "AI_PER_DAY", aiPerMinute: "AI_PER_MINUTE", buildsPerHour: "BUILDS_PER_HOUR", buildsPerDay: "BUILDS_PER_DAY", deploysPerDay: "DEPLOYS_PER_DAY" };

export function tierLimits(tier: Tier, env: Env = procEnv()): TierLimits {
  const out = { ...TIER_DEFAULTS[tier] };
  for (const k of Object.keys(FIELD) as (keyof TierLimits)[]) {
    const n = Number(env[`DEVSTACK_TIER_${tier.toUpperCase()}_${FIELD[k]}`]);
    if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
  }
  return out;
}

export const limitsFor = (login: string | null | undefined, env: Env = procEnv()) => ({ tier: tierFor(login, env), ...tierLimits(tierFor(login, env), env) });

/** Soft hourly build burst (KV). */
export const buildHourOk = (kv: KvLike | null, uid: string, l: TierLimits, now = Date.now()) => kvRateLimit(kv, `build-h:${uid}`, l.buildsPerHour, 3600, now);
