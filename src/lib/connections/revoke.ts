import "server-only";
import { deleteGithubCredential, type D1Like } from "@/lib/chat/store";
import type { SealKeys } from "./credentials";

/** Disconnect GitHub: delete the stored token. (PR-E adds revoking the OAuth grant at GitHub.) */
export async function revokeGithub(db: D1Like, _keys: SealKeys, userId: string): Promise<{ grantRevoked: boolean }> {
  await deleteGithubCredential(db, userId);
  return { grantRevoked: false };
}
