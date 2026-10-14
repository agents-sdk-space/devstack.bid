/** Host side of the sandbox <-> PGlite postMessage bridge (see SANDBOX_DB_BRIDGE). */
export interface SqlRequest {
  type: 'devstack:sql';
  id: number;
  sql: string;
  params?: unknown[];
}

const ALLOWED = /^\s*(select|with|insert\s+into|update|delete\s+from|create\s+table\s+if\s+not\s+exists|alter\s+table)\b/i;
const RESERVED = /\b(embeddings|pg_catalog|pg_\w+|information_schema)\b/i;

export function validateBridgeSql(req: unknown): SqlRequest | string {
  if (!req || typeof req !== 'object') return 'invalid message';
  const r = req as Partial<SqlRequest>;
  if (r.type !== 'devstack:sql' || typeof r.id !== 'number' || typeof r.sql !== 'string') return 'invalid message';
  const sql = r.sql.trim().replace(/;\s*$/, '');
  if (sql.length > 10_000) return 'statement too long';
  if (sql.includes(';')) return 'only one statement per call';
  if (!ALLOWED.test(sql)) return 'statement type not allowed from sandbox';
  if (/^\s*(alter|create|update|delete|insert)/i.test(sql) && RESERVED.test(sql)) return 'reserved table';
  if (/^\s*alter\s+table/i.test(sql) && /\bdrop\b/i.test(sql)) return 'destructive ALTER not allowed';
  const params = Array.isArray(r.params) ? r.params.slice(0, 100) : [];
  return { type: 'devstack:sql', id: r.id, sql, params };
}

export function isMutation(sql: string): boolean {
  return !/^\s*(select|with)\b/i.test(sql) || /\b(insert|update|delete)\b/i.test(sql);
}
