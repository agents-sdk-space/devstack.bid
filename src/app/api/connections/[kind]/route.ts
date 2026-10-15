import { connection } from "next/server";
import { audit } from "@/lib/connections/audit";
import { deleteCredential, saveCredential, type CredentialKind } from "@/lib/connections/credentials";
import { ERROR_TEXT, gate, isResponse } from "@/lib/connections/route-kit";
import { validateCloudflare, validateOpenAI } from "@/lib/connections/validate";
import { revokeGithub } from "@/lib/connections/revoke";
import { json } from "@/lib/chat/runtime";
import { HttpError, readJsonBody } from "@/lib/server/http";

type Ctx = { params: Promise<{ kind: string }> };
const SAVABLE = new Set<CredentialKind>(["cloudflare", "openai"]);

/** PUT /api/connections/cloudflare {token, accountId} | /api/connections/openai {key}: validate with the provider, seal, save. */
export async function PUT(req: Request, ctx: Ctx) {
  await connection();
  const { kind } = await ctx.params;
  if (!SAVABLE.has(kind as CredentialKind)) return json({ error: "Unknown connection. / ไม่รู้จักการเชื่อมต่อนี้", code: "not_found" }, 404);
  const a = await gate(req, { write: true, burstKey: "conn-put", perMinute: 6 });
  if (isResponse(a)) return a;
  let body: { token?: unknown; accountId?: unknown; key?: unknown };
  try {
    body = ((await readJsonBody(req, 4_000)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  const secret = String((kind === "cloudflare" ? body.token : body.key) ?? "").trim();
  const accountId = String(body.accountId ?? "").trim().toLowerCase();
  const result = kind === "cloudflare" ? await validateCloudflare(secret, accountId) : await validateOpenAI(secret);
  if (!result.ok) return json({ error: ERROR_TEXT[result.code], code: result.code }, result.code === "provider_unavailable" ? 502 : 400);
  await saveCredential(a.db, a.keys, a.uid, kind as CredentialKind, secret, result.meta);
  await audit(a.db, a.uid, "credential.saved", kind);
  console.warn(JSON.stringify({ at: "api/connections", event: "saved", kind }));
  return json({ ok: true });
}

/** DELETE /api/connections/:kind — removes the row; for GitHub also revokes the OAuth grant. */
export async function DELETE(req: Request, ctx: Ctx) {
  await connection();
  const { kind } = await ctx.params;
  if (kind !== "github" && !SAVABLE.has(kind as CredentialKind)) return json({ error: "Unknown connection. / ไม่รู้จักการเชื่อมต่อนี้", code: "not_found" }, 404);
  const a = await gate(req, { write: true, burstKey: "conn-del", perMinute: 10 });
  if (isResponse(a)) return a;
  if (kind === "github") {
    const r = await revokeGithub(a.db, a.keys, a.uid);
    await audit(a.db, a.uid, "github.revoked", r.grantRevoked ? "grant" : "local");
    return json({ ok: true, grantRevoked: r.grantRevoked });
  }
  await deleteCredential(a.db, a.uid, kind as CredentialKind);
  await audit(a.db, a.uid, "credential.removed", kind);
  return json({ ok: true });
}
