/**
 * Per-user tiers for AI chat, builds and deploys. There is no billing/plan table yet, so the tier comes from
 * operator env lists of STABLE ids (comma separated), never renameable logins:
 *   DEVSTACK_ADMIN_UIDS / DEVSTACK_PAID_UIDS            — DevStack user ids (users.id)
 *   DEVSTACK_ADMIN_GITHUB_IDS / DEVSTACK_PAID_GITHUB_IDS — numeric GitHub user ids (users.auth_subject, provider github)
 * DEPRECATED: AISITE_ADMIN_LOGINS / DEVSTACK_PAID_LOGINS (login lists) are still honoured for tiers only when
 * DEVSTACK_TIER_ALLOW_LOGINS=1, because a GitHub login can be released and re-registered by someone else.
 * Everyone else → free. Each number can be overridden with DEVSTACK_TIER_<TIER>_<FIELD> (e.g. DEVSTACK_TIER_FREE_AI_PER_DAY).
 * Daily caps are counted in D1 (hard); hourly burst caps use Workers KV (soft, see kv-limit.ts).
 */
import { isAdmin } from "@/lib/aisite/admin";
import type { D1Like } from "@/lib/chat/store";
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

export interface TierIdentity { uid: string; githubId?: string | null; login?: string | null }

export function tierFor(who: TierIdentity, env: Env = procEnv()): Tier {
  const gh = who.githubId && /^\d+$/.test(who.githubId) ? who.githubId : null;
  if (inList(who.uid, env.DEVSTACK_ADMIN_UIDS) || (gh && inList(gh, env.DEVSTACK_ADMIN_GITHUB_IDS))) return "admin";
  if (inList(who.uid, env.DEVSTACK_PAID_UIDS) || (gh && inList(gh, env.DEVSTACK_PAID_GITHUB_IDS))) return "paid";
  if (env.DEVSTACK_TIER_ALLOW_LOGINS === "1" && who.login) {
    if (isAdmin(who.login, env.AISITE_ADMIN_LOGINS ?? "")) return "admin";
    if (inList(who.login, env.DEVSTACK_PAID_LOGINS)) return "paid";
  }
  return "free";
}

/** Stable identity from D1 (github id only for GitHub sign-ins). */
export async function identityOf(db: D1Like, uid: string): Promise<TierIdentity> {
  let r: { auth_provider: string | null; auth_subject: string | null; login: string | null } | null = null;
  try {
    r = await db.prepare("SELECT auth_provider, auth_subject, login FROM users WHERE id = ?1").bind(uid).first<{ auth_provider: string | null; auth_subject: string | null; login: string | null }>();
  } catch {
    r = null; // unknown user / no users table → free tier
  }
  return { uid, githubId: r?.auth_provider === "github" ? r.auth_subject : null, login: r?.login ?? null };
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

export type ResolvedLimits = TierLimits & { tier: Tier };
export function limitsFor(who: TierIdentity, env: Env = procEnv()): ResolvedLimits {
  const tier = tierFor(who, env);
  return { tier, ...tierLimits(tier, env) };
}
export async function limitsForUser(db: D1Like, uid: string, env: Env = procEnv()): Promise<ResolvedLimits> {
  return limitsFor(await identityOf(db, uid), env);
}

/** KV key for the hourly build window (shared by the pre-check and the consuming check). */
export const buildHourKey = (uid: string) => `build-h:${uid}`;
export const buildHourOk = (kv: KvLike | null, uid: string, l: TierLimits, now = Date.now()) => kvRateLimit(kv, buildHourKey(uid), l.buildsPerHour, 3600, now);
