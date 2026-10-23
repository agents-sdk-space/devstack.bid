/** Custom-domain lifecycle for a project: D1 rows + Cloudflare for SaaS + R2 router mapping. */
import type { D1Like } from "@/lib/chat/store";
import type { ProjectRow } from "@/lib/connections/projects";
import { siteSlug } from "./hostnames";
import type { R2BucketLike } from "./serve";
import { createHostname, deleteHostname, getHostname, isLive, normalizeHostname, removeDomainMapping, writeDomainMapping, type DnsRecord, type SaasApi } from "./custom-domains";

export const MAX_DOMAINS_PER_PROJECT = 5;

export interface DomainRow { id: string; project_id: string; user_id: string; hostname: string; cf_hostname_id: string | null; status: string; ssl_status: string | null; verification: string | null; created_at: number; updated_at: number }
export interface DomainView { id: string; hostname: string; status: string; sslStatus: string | null; live: boolean; records: DnsRecord[]; errors: string[]; updatedAt: number }

export function domainView(r: DomainRow): DomainView {
  let v: { records?: DnsRecord[]; errors?: string[] } = {};
  try { v = r.verification ? JSON.parse(r.verification) : {}; } catch { /* stored by us; ignore */ }
  return { id: r.id, hostname: r.hostname, status: r.status, sslStatus: r.ssl_status, live: r.status === "active" && r.ssl_status === "active", records: v.records ?? [], errors: v.errors ?? [], updatedAt: r.updated_at };
}

export type DomainResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string };
const fail = (status: number, code: string) => ({ ok: false as const, status, code });

export async function listDomains(db: D1Like, project: ProjectRow): Promise<DomainView[]> {
  const r = await db.prepare("SELECT * FROM project_domains WHERE project_id = ?1 AND user_id = ?2 ORDER BY created_at").bind(project.id, project.user_id).all<DomainRow>();
  return (r.results ?? []).map(domainView);
}

export async function addDomain(db: D1Like, api: SaasApi, project: ProjectRow, input: string): Promise<DomainResult<DomainView>> {
  const hostname = normalizeHostname(input);
  if (!hostname) return fail(400, "invalid_hostname");
  if (!siteSlug(project.slug || project.name)) return fail(409, "no_site");
  const taken = await db.prepare("SELECT project_id FROM project_domains WHERE hostname = ?1").bind(hostname).first<{ project_id: string }>();
  if (taken) return fail(409, taken.project_id === project.id ? "already_added" : "hostname_taken");
  const n = await db.prepare("SELECT COUNT(*) AS n FROM project_domains WHERE project_id = ?1").bind(project.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_DOMAINS_PER_PROJECT) return fail(409, "too_many_domains");
  let state;
  try { state = await createHostname(api, hostname); } catch (e) { return fail(502, (e as Error).message); }
  const now = Date.now();
  const row: DomainRow = { id: crypto.randomUUID(), project_id: project.id, user_id: project.user_id, hostname, cf_hostname_id: state.id, status: state.status, ssl_status: state.sslStatus, verification: JSON.stringify({ records: state.records, errors: state.errors }), created_at: now, updated_at: now };
  try {
    await db.prepare("INSERT INTO project_domains (id, project_id, user_id, hostname, cf_hostname_id, status, ssl_status, verification, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
      .bind(row.id, row.project_id, row.user_id, row.hostname, row.cf_hostname_id, row.status, row.ssl_status, row.verification, row.created_at, row.updated_at).run();
  } catch {
    await deleteHostname(api, state.id).catch(() => undefined);
    return fail(409, "hostname_taken");
  }
  return { ok: true, value: domainView(row) };
}

async function ownRow(db: D1Like, project: ProjectRow, domainId: string): Promise<DomainRow | null> {
  if (!/^[a-f0-9-]{36}$/.test(domainId)) return null;
  return db.prepare("SELECT * FROM project_domains WHERE id = ?1 AND project_id = ?2 AND user_id = ?3").bind(domainId, project.id, project.user_id).first<DomainRow>();
}

/** Re-check Cloudflare; on live write the router mapping, otherwise make sure none exists. */
export async function verifyDomain(db: D1Like, api: SaasApi, sites: R2BucketLike | null, project: ProjectRow, domainId: string): Promise<DomainResult<DomainView>> {
  const row = await ownRow(db, project, domainId);
  if (!row || !row.cf_hostname_id) return fail(404, "not_found");
  let state;
  try { state = await getHostname(api, row.cf_hostname_id); } catch (e) { return fail(502, (e as Error).message); }
  const label = siteSlug(project.slug || project.name);
  if (isLive(state)) {
    if (!sites || !label) return fail(503, "sites_unavailable");
    await writeDomainMapping(sites, row.hostname, label);
  } else if (sites) {
    await removeDomainMapping(sites, row.hostname);
  }
  const now = Date.now();
  const verification = JSON.stringify({ records: state.records, errors: state.errors });
  await db.prepare("UPDATE project_domains SET status = ?1, ssl_status = ?2, verification = ?3, updated_at = ?4 WHERE id = ?5").bind(state.status, state.sslStatus, verification, now, row.id).run();
  return { ok: true, value: domainView({ ...row, status: state.status, ssl_status: state.sslStatus, verification, updated_at: now }) };
}

export async function removeDomain(db: D1Like, api: SaasApi, sites: R2BucketLike | null, project: ProjectRow, domainId: string): Promise<DomainResult<true>> {
  const row = await ownRow(db, project, domainId);
  if (!row) return fail(404, "not_found");
  if (sites) await removeDomainMapping(sites, row.hostname);
  if (row.cf_hostname_id) { try { await deleteHostname(api, row.cf_hostname_id); } catch (e) { return fail(502, (e as Error).message); } }
  await db.prepare("DELETE FROM project_domains WHERE id = ?1").bind(row.id).run();
  return { ok: true, value: true };
}
