/**
 * Fixed-window cost guards stored in D1 (usage_counters). One turn consumes one unit in each of:
 * per-IP hour/day, per-cookie hour/day and the global day. Images have their own daily buckets.
 * Check-then-increment is not perfectly atomic under heavy concurrency (a burst can overshoot by a
 * few units); the Workers per-minute burst limiter in front keeps that bounded.
 */
import type { D1Like } from "./store";

export type LimitKind =
  | "msg_user_day"
  | "msg_ip_day"
  | "agent_user_day"
  | "agent_global_day"
  | "chat_global_day"
  | "image_user_day"
  | "image_ip_day"
  | "image_global_day"
  | "factory_session_ip_hour"
  | "factory_turn_ip_hour";

export interface LimitRule {
  scope: string;
  bucket: string;
  limit: number;
  kind: LimitKind;
}

export interface LimitResult {
  ok: boolean;
  exceeded?: LimitKind;
  retryAfterSec?: number;
  remaining: Partial<Record<LimitKind, number>>;
}

/** Quotas reset at midnight Asia/Bangkok (UTC+7, no DST). Hourly buckets stay in UTC. */
export const QUOTA_TZ_OFFSET_MS = 7 * 3_600_000;

export function windows(now = new Date()) {
  const iso = now.toISOString(); // UTC
  const hour = `${iso.slice(0, 10).replace(/-/g, "")}${iso.slice(11, 13)}`;
  const local = new Date(now.getTime() + QUOTA_TZ_OFFSET_MS);
  const day = local.toISOString().slice(0, 10).replace(/-/g, "");
  const nextHour = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1);
  const nextLocalMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - QUOTA_TZ_OFFSET_MS;
  return {
    hour: `h:${hour}`,
    day: `d:${day}`,
    hourResetSec: Math.max(1, Math.ceil((nextHour - now.getTime()) / 1000)),
    dayResetSec: Math.max(1, Math.ceil((nextLocalMidnight - now.getTime()) / 1000)),
  };
}

export interface QuotaConfig {
  messagesPerDay: number; // FREE_DAILY_MESSAGES (User Chat, per cookie)
  imagesPerDay: number; // FREE_DAILY_IMAGES (User Chat, per cookie)
  ipMultiplier: number; // per-IP backstop = per-user limit x this
  chatGlobalDay: number; // CHAT_USER_GLOBAL_PER_DAY (all User Chat messages)
  imagesGlobalDay: number; // CHAT_USER_GLOBAL_IMAGES_PER_DAY (Workers AI images)
  agentPerDay: number; // CHAT_AGENT_TURNS_PER_DAY (Dev Chat, per cookie)
  agentGlobalDay: number; // CHAT_GLOBAL_TURNS_PER_DAY (Dev Chat, all users; protects the OpenAI credit)
  agentImagesPerDay: number; // CHAT_AGENT_IMAGES_PER_DAY (OpenAI images inside agent turns, per cookie)
  agentImagesGlobalDay: number; // CHAT_GLOBAL_IMAGES_PER_DAY (OpenAI images, all users)
}

/** User Chat text message: free daily messages per cookie + per-IP backstop + a site-wide cap. */
export function messageRules(ipKey: string, uid: string, q: QuotaConfig, now = new Date()): LimitRule[] {
  const w = windows(now);
  return [
    { scope: `msg:uid:${uid}`, bucket: w.day, limit: q.messagesPerDay, kind: "msg_user_day" },
    { scope: `msg:ip:${ipKey}`, bucket: w.day, limit: q.messagesPerDay * q.ipMultiplier, kind: "msg_ip_day" },
    { scope: "msg:global", bucket: w.day, limit: q.chatGlobalDay, kind: "chat_global_day" },
  ];
}

/** Dev Chat agent turn (OpenAI server key): per-cookie daily turns + per-IP backstop + low global cap. */
export function agentRules(ipKey: string, uid: string, q: QuotaConfig, now = new Date()): LimitRule[] {
  const w = windows(now);
  return [
    { scope: `agent:uid:${uid}`, bucket: w.day, limit: q.agentPerDay, kind: "agent_user_day" },
    { scope: `agent:ip:${ipKey}`, bucket: w.day, limit: q.agentPerDay * q.ipMultiplier, kind: "msg_ip_day" },
    { scope: "agent:global", bucket: w.day, limit: q.agentGlobalDay, kind: "agent_global_day" },
  ];
}

/** Image generation. kind "user" = FLUX on Workers AI (User Chat); "agent" = OpenAI images in Dev Chat. */
export function imageRules(ipKey: string, uid: string, q: QuotaConfig, kind: "user" | "agent" = "user", now = new Date()): LimitRule[] {
  const w = windows(now);
  const per = kind === "user" ? q.imagesPerDay : q.agentImagesPerDay;
  const global = kind === "user" ? q.imagesGlobalDay : q.agentImagesGlobalDay;
  const p = kind === "user" ? "image" : "agentimage";
  return [
    { scope: `${p}:uid:${uid}`, bucket: w.day, limit: per, kind: "image_user_day" },
    { scope: `${p}:ip:${ipKey}`, bucket: w.day, limit: per * q.ipMultiplier, kind: "image_ip_day" },
    { scope: `${p}:global`, bucket: w.day, limit: global, kind: "image_global_day" },
  ];
}

/** Remaining quota for the UI (no increment). */
export async function quotaStatus(db: D1Like, ipKey: string, uid: string | null, q: QuotaConfig, channel: "user" | "dev", now = new Date()) {
  const w = windows(now);
  const rules = channel === "user" ? [...messageRules(ipKey, uid ?? "-", q, now), ...imageRules(ipKey, uid ?? "-", q, "user", now)] : agentRules(ipKey, uid ?? "-", q, now);
  const counts = uid ? await readCounts(db, rules) : rules.map(() => 0);
  const left = (i: number) => Math.max(0, rules[i].limit - counts[i]);
  if (channel === "user")
    return { messagesLeft: Math.min(left(0), left(1), left(2)), imagesLeft: Math.min(left(3), left(4), left(5)), resetSec: w.dayResetSec };
  return { agentLeft: Math.min(left(0), left(1), left(2)), resetSec: w.dayResetSec };
}

/** Sandbox Factory: per-IP hourly anti-abuse buckets (the user's own key pays, so no global caps). */
export function factoryRules(ipKey: string, kind: "session" | "turn", limit: number, now = new Date()): LimitRule[] {
  return [{ scope: `factory:${kind}:ip:${ipKey}`, bucket: windows(now).hour, limit, kind: kind === "session" ? "factory_session_ip_hour" : "factory_turn_ip_hour" }];
}

export async function readCounts(db: D1Like, rules: LimitRule[]): Promise<number[]> {
  const rows = await db.batch(rules.map((r) => db.prepare("SELECT count FROM usage_counters WHERE scope = ?1 AND bucket = ?2").bind(r.scope, r.bucket)));
  return rows.map((r) => Number((r.results?.[0] as { count?: number } | undefined)?.count ?? 0));
}

/** Check every rule; if all have room, increment all of them. */
export async function consume(db: D1Like, rules: LimitRule[], now = new Date()): Promise<LimitResult> {
  const counts = await readCounts(db, rules);
  const remaining: LimitResult["remaining"] = {};
  rules.forEach((r, i) => (remaining[r.kind] = Math.max(0, r.limit - counts[i])));
  const idx = rules.findIndex((r, i) => counts[i] >= r.limit);
  if (idx >= 0) {
    const w = windows(now);
    return { ok: false, exceeded: rules[idx].kind, retryAfterSec: rules[idx].bucket.startsWith("h:") ? w.hourResetSec : w.dayResetSec, remaining };
  }
  await db.batch(
    rules.map((r) =>
      db
        .prepare(
          "INSERT INTO usage_counters (scope, bucket, count) VALUES (?1, ?2, 1) ON CONFLICT (scope, bucket) DO UPDATE SET count = count + 1, updated_at = unixepoch('subsec') * 1000"
        )
        .bind(r.scope, r.bucket)
    )
  );
  rules.forEach((r) => (remaining[r.kind] = Math.max(0, (remaining[r.kind] ?? 0) - 1)));
  return { ok: true, remaining };
}

/** Give back one unit (e.g. the turn failed before reaching the model). */
export async function refund(db: D1Like, rules: LimitRule[]): Promise<void> {
  await db.batch(
    rules.map((r) => db.prepare("UPDATE usage_counters SET count = MAX(count - 1, 0) WHERE scope = ?1 AND bucket = ?2").bind(r.scope, r.bucket))
  );
}

/** Delete counters older than 3 days (called occasionally). */
export async function pruneCounters(db: D1Like, now = Date.now()): Promise<void> {
  await db.prepare("DELETE FROM usage_counters WHERE updated_at < ?1").bind(now - 3 * 86_400_000).run();
}

/** Global daily spend (micro-USD) — compared against CHAT_DAILY_BUDGET_USD before each turn. */
export async function spentToday(db: D1Like, now = new Date()): Promise<number> {
  const row = await db.prepare("SELECT count FROM usage_counters WHERE scope = 'cost:global' AND bucket = ?1").bind(windows(now).day).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function addSpend(db: D1Like, microUsd: number, now = new Date()): Promise<void> {
  if (!(microUsd > 0)) return;
  await db
    .prepare(
      "INSERT INTO usage_counters (scope, bucket, count) VALUES ('cost:global', ?1, ?2) ON CONFLICT (scope, bucket) DO UPDATE SET count = count + ?2, updated_at = unixepoch('subsec') * 1000"
    )
    .bind(windows(now).day, Math.round(microUsd))
    .run();
}
