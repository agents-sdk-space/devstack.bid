/** Write a build's output to R2 and point hostnames at it (production alias = promote). */
import { previewHost, productionHost, PLATFORM_DOMAIN } from "./hostnames";
import { contentType, objectPath, type R2BucketLike } from "./serve";

export interface SiteFile { path: string; bytes: Uint8Array }
export const MAX_SITE_FILES = 20_000;
export const MAX_SITE_BYTES = 500 * 1024 * 1024;

export async function writeSite(bucket: R2BucketLike, deploymentId: string, files: SiteFile[]): Promise<{ files: number; bytes: number }> {
  if (files.length > MAX_SITE_FILES) throw new Error("too_many_files");
  let bytes = 0;
  for (const f of files) {
    const p = objectPath(f.path);
    if (!p) continue;
    bytes += f.bytes.length;
    if (bytes > MAX_SITE_BYTES) throw new Error("too_large");
    await bucket.put(`sites/${deploymentId}/${p}`, f.bytes, { httpMetadata: { contentType: contentType(p) } });
  }
  return { files: files.length, bytes };
}

export class HostTakenError extends Error {
  constructor(public host: string) { super("host_taken"); }
}

/** Point a hostname at a deployment. A hostname belongs to the first project that claims it. */
async function alias(bucket: R2BucketLike, host: string, projectId: string, deploymentId: string, domain: string, worker?: string) {
  const label = host.slice(0, -domain.length - 1);
  const key = `hosts/${label}.json`;
  const cur = await bucket.get(key);
  if (cur) {
    const text = cur.text ? await cur.text() : await new Response(cur.body).text();
    let owner: unknown = null;
    try { owner = (JSON.parse(text) as { projectId?: unknown }).projectId; } catch { owner = null; }
    if (owner !== projectId) throw new HostTakenError(host);
  }
  await bucket.put(key, JSON.stringify(worker ? { projectId, deploymentId, worker, updatedAt: Date.now() } : { projectId, deploymentId, updatedAt: Date.now() }), { httpMetadata: { contentType: "application/json" } });
}

/** Preview URL for one deployment (immutable). */
export async function publishPreview(bucket: R2BucketLike, slug: string, projectId: string, deploymentId: string, domain = PLATFORM_DOMAIN): Promise<string> {
  const host = previewHost(slug, deploymentId, domain);
  await alias(bucket, host, projectId, deploymentId, domain);
  return `https://${host}`;
}

/** Promote: the production hostname now serves this deployment. */
export async function promoteProduction(bucket: R2BucketLike, slug: string, projectId: string, deploymentId: string, domain = PLATFORM_DOMAIN): Promise<string> {
  const host = productionHost(slug, domain);
  await alias(bucket, host, projectId, deploymentId, domain);
  return `https://${host}`;
}

/** Point the production host (and this deployment's preview host) at the project's server Worker. */
export async function publishServer(bucket: R2BucketLike, slug: string, projectId: string, deploymentId: string, worker: string, production: boolean, domain = PLATFORM_DOMAIN): Promise<{ preview: string; production: string | null }> {
  const pv = previewHost(slug, deploymentId, domain);
  await alias(bucket, pv, projectId, deploymentId, domain, worker);
  if (!production) return { preview: `https://${pv}`, production: null };
  const prod = productionHost(slug, domain);
  await alias(bucket, prod, projectId, deploymentId, domain, worker);
  return { preview: `https://${pv}`, production: `https://${prod}` };
}
