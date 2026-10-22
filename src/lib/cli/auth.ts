import "server-only";
import { consume, windows } from "@/lib/chat/limits";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { LIMITS } from "@/lib/connections/policy";
import { audit } from "@/lib/connections/audit";
import { authenticateMcpClient, consumeMcpClient, isCliKey, type McpClient } from "@/lib/mcp/auth";
import type { D1Like } from "@/lib/chat/store";

/** CLI keys are ordinary hashed api_clients rows restricted to the single `cli:setup` scope. */
export const CLI_SCOPE = "cli:setup" as const;

const err = (status: number, code: string, error: string, headers?: Record<string, string>) => json({ error, code }, status, { "Cache-Control": "no-store", ...headers });

export async function cliGate(req: Request, scopes: readonly string[] = [CLI_SCOPE]): Promise<{ client: McpClient; db: D1Like } | Response> {
  const { db } = await chatRuntime();
  if (!db) return err(503, "unavailable", "Storage unavailable.");
  const { client, error } = await authenticateMcpClient(req, db);
  if (!client) return err(401, error ?? "invalid", error === "missing" ? "Missing DEVSTACK_KEY." : "Invalid or revoked DEVSTACK_KEY. Create a new one at devstack.bid/settings/cli.");
  if (!isCliKey(client.scopes)) return err(403, "scope", "MCP keys cannot be used with the CLI. Run `devstack login`.");
  if (!scopes.some((s) => (client.scopes as string[]).includes(s))) return err(403, "scope", `This key lacks the ${scopes.join(" or ")} scope. Run \`devstack login\`.`);
  const rl = await consumeMcpClient(db, client);
  if (!rl.ok) return err(429, "rate_limited", "Too many requests. Wait a minute.", { "Retry-After": String(rl.retryAfter) });
  return { client, db };
}

/** Daily scaffold quota per user (capacity-derived, docs/limits.md). */
export async function takeCliQuota(db: D1Like, uid: string): Promise<Response | null> {
  const r = await consume(db, [{ scope: `cli:scaffold:u:${uid}`, bucket: windows().day, limit: LIMITS.cliScaffoldsPerDay, kind: "cli_user_day" }]);
  if (!r.ok) return err(429, "rate_limited", `Daily setup limit reached (${LIMITS.cliScaffoldsPerDay}/day).`);
  await audit(db, uid, "cli.scaffold");
  return null;
}
