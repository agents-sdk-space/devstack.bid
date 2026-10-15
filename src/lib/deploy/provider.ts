import type { DeployProfile } from "./templates";

/**
 * Deployment providers. Each provider deploys a set of files into the CUSTOMER's own account using
 * the credential they connected in /settings/connections. Add a provider by implementing this
 * interface and registering it in `providers.ts` (Vercel is a stub — see vercel.ts).
 */

export type ProviderId = "cloudflare" | "vercel";

export interface DeployFile {
  path: string;
  bytes: Uint8Array;
}

export interface DeployInput {
  name: string;
  profile: DeployProfile;
  files: DeployFile[];
  /** Opened credential + display meta (never logged, never returned). */
  credential: { secret: string; meta: { account_id?: string } };
}

export interface DeployOutput {
  url: string | null;
  versionId: string | null;
}

export class DeployError extends Error {
  constructor(
    public code: string,
    /** Raw detail; callers MUST pass it through sanitizeLog before storing. */
    public detail: string
  ) {
    super(code);
    this.name = "DeployError";
  }
}

export interface DeployProvider {
  id: ProviderId;
  /** Which /settings/connections credential this provider uses. */
  credentialKind: "cloudflare" | "vercel";
  /** deployments.target value. */
  target: string;
  /** Whether this provider can deploy the profile directly (no build server). */
  supports(profile: DeployProfile): boolean;
  deploy(input: DeployInput, onStatus: (s: "uploading") => Promise<void>): Promise<DeployOutput>;
}
