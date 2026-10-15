import "server-only";
import type { D1Like } from "@/lib/chat/store";

export const MCP_SCOPES = [
  "plan:write",
  "chat:read",
  "chat:write",
  "dev:write",
  "factory:write",
  "github:read",
  "github:write",
  "cli:setup",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export interface McpClient {
  id: string;
  userId: string;
  name: string;
  scopes: McpScope[];
  rateLimit: number;
}

interface ClientRow {
  id: string;
  user_id: string | null;
  name: string;
  scopes: string;
  rate_limit: number;
}

export function isMcpScope(value: unknown): value is McpScope {
  return typeof value === "string" && (MCP_SCOPES as readonly string[]).includes(value);
}

export async function hashMcpKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseScopes(value: string): McpScope[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isMcpScope) : [];
  } catch {
    return [];
  }
}

export async function authenticateMcpClient(req: Request, db: D1Like): Promise<{ client: McpClient | null; error: "missing" | "invalid" | null }> {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(nvx_live_[A-Za-z0-9_-]{43})$/i);
  if (!match) return { client: null, error: req.headers.has("authorization") ? "invalid" : "missing" };
  const keyHash = await hashMcpKey(match[1]);
  const row = await db
    .prepare("SELECT id, user_id, name, scopes, rate_limit FROM api_clients WHERE key_hash = ?1 AND revoked_at IS NULL")
    .bind(keyHash)
    .first<ClientRow>();
  if (!row?.user_id) return { client: null, error: "invalid" };
  return {
    error: null,
    client: { id: row.id, userId: row.user_id, name: row.name, scopes: parseScopes(row.scopes), rateLimit: row.rate_limit },
  };
}

export async function mintMcpKey(): Promise<string> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of random) binary += String.fromCharCode(byte);
  return `nvx_live_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** Per-key fixed-window limit stored in the existing D1 usage counter table. */
export async function consumeMcpClient(db: D1Like, client: McpClient, now = Date.now()): Promise<{ ok: boolean; retryAfter: number }> {
  const minute = Math.floor(now / 60_000);
  const bucket = `m:${minute}`;
  const inserted = await db
    .prepare("INSERT INTO usage_counters (scope, bucket, count) VALUES (?1, ?2, 1) ON CONFLICT (scope, bucket) DO UPDATE SET count = count + 1, updated_at = unixepoch('subsec') * 1000 WHERE count < ?3 RETURNING count")
    .bind(`mcp:client:${client.id}`, bucket, client.rateLimit)
    .first<{ count: number }>();
  if (!inserted) return { ok: false, retryAfter: Math.max(1, 60 - Math.floor((now % 60_000) / 1000)) };
  return { ok: true, retryAfter: 0 };
}
