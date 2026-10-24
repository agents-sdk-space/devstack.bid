/** Write a build's output to R2 and point hostnames at it (production alias = promote). */
import { previewHost, productionHost, PLATFORM_DOMAIN } from "./hostnames";
import { contentType, objectPath, type R2BucketLike } from "./serve";

export interface SiteFile { path: string; bytes: Uint8Array }
export const MAX_SITE_FILES = 20_000;
export const MAX_SITE_BYTES = 500 * 1024 * 1024;

export async function writeSite(bucket: R2BucketLike, deploymentId: string, files: SiteFile[]): Promise<{ files: number; bytes: number }> {
  // Validate the output BEFORE writing or creating a public hostname.
  // A "successful" static deploy without index.html would serve HTTP 404 at /.
  const valid = files.flatMap((file) => {
    const path = objectPath(file.path);
    return path ? [{ path, bytes: file.bytes }] : [];
  });
  const index = valid.find((file) => file.path === "index.html");
  if (!index) throw new Error("missing_index");

  // Expo's default web.output=single generates one index.html and a Metro
  // _expo/static/js/web bundle. Our site router already uses 200.html as its
  // opt-in SPA fallback. Create that artifact only for an Expo single-page
  // export: SSG sites and non-Expo sites keep their actual 404 behavior.
  const isExpoSingle = valid.filter((file) => /\.html$/i.test(file.path)).length === 1
    && valid.some((file) => /^_expo\/static\/js\/web\/[^/]+\.js$/i.test(file.path));
  const upload = isExpoSingle && !valid.some((file) => file.path === "200.html")
    ? [...valid, { path: "200.html", bytes: index.bytes }]
    : valid;
  if (upload.length > MAX_SITE_FILES) throw new Error("too_many_files");
  const bytes = upload.reduce((sum, file) => sum + file.bytes.length, 0);
  if (bytes > MAX_SITE_BYTES) throw new Error("too_large");

  for (const file of upload) {
    await bucket.put(`sites/${deploymentId}/${file.path}`, file.bytes, {
      httpMetadata: { contentType: contentType(file.path) },
    });
  }

  // R2 is strongly consistent. Refuse to mark the deployment live if the
  // published entry point cannot be read back from the hosting bucket.
  if (!(await bucket.get(`sites/${deploymentId}/index.html`))) {
    throw new Error("published_index_unavailable");
  }
  return { files: upload.length, bytes };
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
  await indexWorker(bucket, worker, pv.slice(0, -domain.length - 1));
  if (!production) return { preview: `https://${pv}`, production: null };
  const prod = productionHost(slug, domain);
  await alias(bucket, prod, projectId, deploymentId, domain, worker);
  await indexWorker(bucket, worker, prod.slice(0, -domain.length - 1));
  return { preview: `https://${pv}`, production: `https://${prod}` };
}

/** Record which host labels point at a Worker so preview cleanup can remove the aliases. */
async function indexWorker(bucket: R2BucketLike, worker: string, label: string) {
  const key = `workers/${worker}.json`;
  const cur = await bucket.get(key);
  let labels: string[] = [];
  if (cur) { try { labels = (JSON.parse(cur.text ? await cur.text() : await new Response(cur.body).text()) as { labels?: string[] }).labels ?? []; } catch { labels = []; } }
  if (!labels.includes(label)) labels.push(label);
  await bucket.put(key, JSON.stringify({ worker, labels: labels.slice(-50) }), { httpMetadata: { contentType: "application/json" } });
}
