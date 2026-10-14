import { z } from "zod";
import { sameOrigin } from "@/lib/auth/github-policy";
import { resolveActor } from "@/lib/chat/identity";
import { chatEnv, chatRuntime, json } from "@/lib/chat/runtime";
import { getAccount } from "@/lib/chat/store";
import { hashMcpKey, isMcpScope, MCP_SCOPES, mintMcpKey } from "@/lib/mcp/auth";
import { HttpError, readJsonBody } from "@/lib/server/http";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).min(1).max(MCP_SCOPES.length),
});

async function signedIn(req: Request) {
  const env = chatEnv();
  const { db } = await chatRuntime();
  if (!env.CHAT_COOKIE_SECRET || !db) return { response: json({ error: "Storage unavailable. / ระบบจัดเก็บไม่พร้อม", code: "unavailable" }, 503) } as const;
  const actor = await resolveActor(req, env.CHAT_COOKIE_SECRET);
  if (!actor.authenticated || !actor.uid) return { response: json({ error: "Sign in first. / กรุณาเข้าสู่ระบบก่อน", code: "unauthorized" }, 401) } as const;
  return { env, db, uid: actor.uid } as const;
}

export async function GET(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Same-origin request required", code: "forbidden" }, 403);
  const auth = await signedIn(req);
  if ("response" in auth) return auth.response;
  const rows = await auth.db
    .prepare("SELECT id, name, scopes, rate_limit, created_at FROM api_clients WHERE user_id = ?1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50")
    .bind(auth.uid)
    .all<{ id: string; name: string; scopes: string; rate_limit: number; created_at: number }>();
  return json({ scopes: MCP_SCOPES, clients: (rows.results ?? []).map((r) => ({ id: r.id, name: r.name, scopes: JSON.parse(r.scopes) as string[], rateLimit: r.rate_limit, createdAt: r.created_at })) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Same-origin request required", code: "forbidden" }, 403);
  const auth = await signedIn(req);
  if ("response" in auth) return auth.response;
  let raw: unknown;
  try { raw = await readJsonBody(req, 8 * 1024); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: "invalid" }, error.status);
    return json({ error: "Invalid JSON body", code: "invalid" }, 400);
  }
  const body = createSchema.safeParse(raw);
  if (!body.success || body.data.scopes.some((s) => !isMcpScope(s))) return json({ error: "Invalid name or scope", code: "invalid" }, 400);
  const uniqueScopes = [...new Set(body.data.scopes)];
  if (uniqueScopes.some((s) => s.startsWith("github:") )) {
    const account = await getAccount(auth.db, auth.uid);
    if (account?.provider !== "github") return json({ error: "Sign in with GitHub before granting GitHub tools", code: "github_required" }, 400);
  }
  const current = await auth.db.prepare("SELECT COUNT(*) AS n FROM api_clients WHERE user_id = ?1 AND revoked_at IS NULL").bind(auth.uid).first<{ n: number }>();
  if (Number(current?.n ?? 0) >= 20) return json({ error: "Maximum of 20 active MCP keys", code: "key_limit" }, 409);
  const key = await mintMcpKey();
  const id = crypto.randomUUID();
  await auth.db
    .prepare("INSERT INTO api_clients (id, user_id, name, key_hash, scopes, rate_limit) VALUES (?1, ?2, ?3, ?4, ?5, 60)")
    .bind(id, auth.uid, body.data.name, await hashMcpKey(key), JSON.stringify(uniqueScopes))
    .run();
  return json({ client: { id, name: body.data.name, scopes: uniqueScopes, rateLimit: 60 }, key }, 201);
}
