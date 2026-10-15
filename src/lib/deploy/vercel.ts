import { DeployError, type DeployProvider } from "./provider";

/**
 * TODO(vercel): implement with the Vercel REST API (POST /v13/deployments with inline files, the
 * customer's token from a new "vercel" credential kind). Not implemented yet by design; registered
 * so the interface stays honest and the UI can show "coming soon".
 */
export const vercelProvider: DeployProvider = {
  id: "vercel",
  credentialKind: "vercel",
  target: "vercel",
  supports: () => false,
  async deploy() {
    throw new DeployError("not_implemented", "Vercel deploys are not available yet.");
  },
};
