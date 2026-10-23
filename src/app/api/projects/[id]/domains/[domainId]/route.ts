import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { domainContext, domainError } from "@/lib/hosting/domain-route";
import { removeDomain, verifyDomain } from "@/lib/hosting/domain-service";

type P = { params: Promise<{ id: string; domainId: string }> };

/** POST /api/projects/:id/domains/:domainId — re-check verification/SSL with Cloudflare; maps the host when live. */
export async function POST(req: Request, ctx: P) {
  await connection();
  const { id, domainId } = await ctx.params;
  const c = await domainContext(req, id, true);
  if (c instanceof Response) return c;
  if (!c.api) return domainError(503, "custom_domains_not_configured");
  const r = await verifyDomain(c.a.db, c.api, c.sites, c.p, domainId);
  return r.ok ? json({ domain: r.value }) : domainError(r.status, r.code);
}

/** DELETE /api/projects/:id/domains/:domainId — unmap, delete the custom hostname, drop the row. */
export async function DELETE(req: Request, ctx: P) {
  await connection();
  const { id, domainId } = await ctx.params;
  const c = await domainContext(req, id, true);
  if (c instanceof Response) return c;
  if (!c.api) return domainError(503, "custom_domains_not_configured");
  const r = await removeDomain(c.a.db, c.api, c.sites, c.p, domainId);
  return r.ok ? json({ ok: true }) : domainError(r.status, r.code);
}
