import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { domainContext, domainError } from "@/lib/hosting/domain-route";
import { addDomain, listDomains } from "@/lib/hosting/domain-service";

/** GET /api/projects/:id/domains — custom domains + DNS records to add. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const c = await domainContext(req, (await ctx.params).id, false);
  if (c instanceof Response) return c;
  return json({ enabled: !!c.api, cnameTarget: c.api?.cnameTarget ?? null, domains: await listDomains(c.a.db, c.p) });
}

/** POST /api/projects/:id/domains {hostname} — register a Cloudflare for SaaS custom hostname. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const c = await domainContext(req, (await ctx.params).id, true);
  if (c instanceof Response) return c;
  if (!c.api) return domainError(503, "custom_domains_not_configured");
  const body = (await req.json().catch(() => null)) as { hostname?: unknown } | null;
  const r = await addDomain(c.a.db, c.api, c.p, typeof body?.hostname === "string" ? body.hostname : "");
  return r.ok ? json({ domain: r.value }, 201) : domainError(r.status, r.code);
}
