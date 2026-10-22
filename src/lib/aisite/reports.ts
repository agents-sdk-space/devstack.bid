/** Abuse reports for user sites (badge link). Stored in D1 site_reports for operator review. */
import type { D1Like } from "@/lib/chat/store";
import { parseHost } from "@/lib/hosting/hostnames";

export const REPORT_REASONS = ["phishing", "malware", "spam", "illegal", "impersonation", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function validateReport(b: { site?: unknown; reason?: unknown; details?: unknown }): { host: string; reason: ReportReason; details: string | null } | null {
  const host = typeof b.site === "string" ? b.site.trim().toLowerCase() : "";
  if (parseHost(host).kind !== "site") return null;
  if (!REPORT_REASONS.includes(b.reason as ReportReason)) return null;
  const details = typeof b.details === "string" ? b.details.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, 1000) || null : null;
  return { host, reason: b.reason as ReportReason, details };
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function saveReport(db: D1Like, r: { host: string; reason: string; details: string | null }, ip: string, salt: string): Promise<number> {
  const row = await db.prepare("INSERT INTO site_reports (host, reason, details, ip_hash) VALUES (?1, ?2, ?3, ?4) RETURNING id").bind(r.host, r.reason, r.details, await sha256(`${salt}:${ip}`)).first<{ id: number }>();
  return row!.id;
}
