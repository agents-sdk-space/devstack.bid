import { planAccountLink } from "@/lib/auth/github-policy";
import { CHAT_COOKIE, readCookie, verifyUid } from "@/lib/chat/identity";
import { findUserByAuth, linkableAnonId, newId, type AccountPlanRow, type D1Like } from "@/lib/chat/store";

/** Where this sign-in should land. An existing account wins. A blank anonymous row can be promoted. */
export async function planSignIn(db: D1Like, req: Request, secret: string, provider: string, subject: string): Promise<AccountPlanRow> {
  const anonCookie = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), secret);
  const anon = await linkableAnonId(db, anonCookie);
  const existing = await findUserByAuth(db, provider, subject);
  return planAccountLink(anon, existing?.id ?? null, newId());
}
