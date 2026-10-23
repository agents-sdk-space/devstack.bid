import "server-only";
import { json } from "@/lib/chat/runtime";
import { getProject, type ProjectRow } from "@/lib/connections/projects";
import { gate, isResponse, type Actor } from "@/lib/connections/route-kit";
import { saasFromEnv, type SaasApi } from "./custom-domains";
import type { R2BucketLike } from "./serve";

export const DOMAIN_ERRORS: Record<string, string> = {
  invalid_hostname: "Enter a domain like example.com or www.example.com. / ใส่โดเมนเช่น example.com",
  no_site: "Deploy this project first. / กรุณา deploy โปรเจกต์ก่อน",
  already_added: "This domain is already on this project. / เพิ่มโดเมนนี้แล้ว",
  hostname_taken: "This domain is used by another project. / โดเมนนี้ถูกใช้แล้ว",
  too_many_domains: "Up to 5 domains per project. / ได้สูงสุด 5 โดเมนต่อโปรเจกต์",
  not_found: "Domain not found. / ไม่พบโดเมน",
  sites_unavailable: "Site storage unavailable. / ระบบจัดเก็บเว็บไม่พร้อม",
  custom_domains_not_configured: "Custom domains are not enabled on this platform yet. / ระบบโดเมนของคุณเองยังไม่เปิดใช้งาน",
};

export function domainError(status: number, code: string): Response {
  return json({ error: DOMAIN_ERRORS[code] ?? "Cloudflare rejected the request. / Cloudflare ปฏิเสธคำขอ", code }, status);
}

export async function domainContext(req: Request, id: string, write: boolean): Promise<Response | { a: Actor; p: ProjectRow; api: SaasApi | null; sites: R2BucketLike | null }> {
  const a = await gate(req, { write, burstKey: write ? "domains-w" : "domains-r", perMinute: 30 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, id);
  if (!p) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  let env: Record<string, unknown> = {};
  try { const { getCloudflareContext } = await import("@opennextjs/cloudflare"); env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>; } catch { /* not on Workers */ }
  return { a, p, api: saasFromEnv(env), sites: (env.SITES as R2BucketLike | undefined) ?? null };
}
