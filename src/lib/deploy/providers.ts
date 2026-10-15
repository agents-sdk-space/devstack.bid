import { createCloudflareProvider } from "./cloudflare";
import type { DeployProvider, ProviderId } from "./provider";
import type { DeployProfile } from "./templates";
import { vercelProvider } from "./vercel";

/** Provider registry. Add Vercel (or others) here once implemented. */
export function providers(f: typeof fetch = fetch): Record<ProviderId, DeployProvider> {
  return { cloudflare: createCloudflareProvider(f), vercel: vercelProvider };
}

/** Pick the provider for a profile from the mapping table (default: Cloudflare). */
export function pickProvider(profile: DeployProfile, preferred: ProviderId = "cloudflare", f: typeof fetch = fetch): DeployProvider | null {
  const all = providers(f);
  const p = all[preferred];
  return p.supports(profile) ? p : null;
}
