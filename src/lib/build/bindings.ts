/** Resolve the build executor bindings from the Worker env (nulls when not provisioned → Blocked). */
import type { R2BucketLike } from "@/lib/hosting/serve";
import type { BuildBindings, ContainerStub, QueueLike } from "./executor";

type Ns = { getByName?(name: string): ContainerStub; idFromName?(n: string): unknown; get?(id: unknown): ContainerStub };

export function buildBindings(env: Record<string, unknown>): BuildBindings {
  const ns = env.BUILD_CONTAINER as Ns | undefined;
  const container = ns
    ? (jobId: string): ContainerStub => (ns.getByName ? ns.getByName(`build-${jobId}`) : ns.get!(ns.idFromName!(`build-${jobId}`)))
    : null;
  return {
    queue: (env.BUILD_QUEUE as QueueLike | undefined) ?? null,
    artifacts: (env.BUILD_ARTIFACTS as R2BucketLike | undefined) ?? null,
    sites: (env.SITES as R2BucketLike | undefined) ?? null,
    container,
    dnsReady: env.SITES_DNS_READY === "1",
    // Platform token for per-project server Workers (Workers Scripts: Edit). Never sent to the container.
    cfApi: typeof env.SITES_CF_API_TOKEN === "string" && env.SITES_CF_API_TOKEN && typeof env.SITES_CF_ACCOUNT_ID === "string" && env.SITES_CF_ACCOUNT_ID
      && typeof env.SITES_PROXY_SECRET === "string" && env.SITES_PROXY_SECRET.length >= 32
      ? { token: env.SITES_CF_API_TOKEN, accountId: env.SITES_CF_ACCOUNT_ID, proxySecret: env.SITES_PROXY_SECRET }
      : null,
  };
}

/** Bindings for a Next.js route handler (nulls outside Workers). */
export async function routeBuildBindings(): Promise<BuildBindings> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const cf = await getCloudflareContext({ async: true });
    return buildBindings(cf.env as unknown as Record<string, unknown>);
  } catch {
    return buildBindings({});
  }
}
