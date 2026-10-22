import "server-only";
import { ghFetch, revokeGrant } from "@/lib/auth/github-api";
import { deleteGithubCredential, type D1Like } from "@/lib/chat/store";
import { serverEnv } from "@/lib/server/env";
import { loadGithubToken, type SealKeys } from "./credentials";

/**
 * Disconnect GitHub: revoke the OAuth grant at GitHub (so the token stops working everywhere),
 * then delete the stored token. A failed remote revoke still deletes locally.
 */
export async function revokeGithub(db: D1Like, keys: SealKeys, userId: string, f: typeof fetch = ghFetch as typeof fetch): Promise<{ grantRevoked: boolean }> {
  let grantRevoked = false;
  const token = await loadGithubToken(db, keys, userId).catch(() => null);
  const server = serverEnv();
  if (token && server.GITHUB_CLIENT_ID && server.GITHUB_CLIENT_SECRET) {
    grantRevoked = await revokeGrant({ clientId: server.GITHUB_CLIENT_ID, clientSecret: server.GITHUB_CLIENT_SECRET, token }, f).catch(() => false);
  }
  await deleteGithubCredential(db, userId);
  return { grantRevoked };
}
