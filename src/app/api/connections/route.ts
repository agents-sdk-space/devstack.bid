import { connection } from "next/server";
import { githubScope, listCredentials } from "@/lib/connections/credentials";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { json } from "@/lib/chat/runtime";

/** GET /api/connections — masked metadata only ({kind,label,last4,scopes,verifiedAt}); never a secret. */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "conn-list", perMinute: 30 });
  if (isResponse(a)) return a;
  const [creds, scope] = await Promise.all([listCredentials(a.db, a.uid).catch(() => []), githubScope(a.db, a.uid).catch(() => null)]);
  const github = scope ? { kind: "github", label: a.login ? `@${a.login}` : "GitHub", last4: "", masked: "", scopes: scope.split(/\s+/).filter(Boolean), verifiedAt: null } : null;
  return json({ connections: [...(github ? [github] : []), ...creds], encryption: a.keys.credentialsKey ? "v2" : "v1" }, 200, { "Cache-Control": "no-store" });
}
