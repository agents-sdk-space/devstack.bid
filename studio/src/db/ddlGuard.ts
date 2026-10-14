/** Split SQL into statements, respecting quotes, dollar-quotes and comments. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let quote: string | null = null;
  while (i < sql.length) {
    const ch = sql[i] as string;
    const next = sql[i + 1];
    if (!quote) {
      if (ch === '-' && next === '-') {
        const nl = sql.indexOf('\n', i);
        i = nl < 0 ? sql.length : nl + 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        const end = sql.indexOf('*/', i + 2);
        i = end < 0 ? sql.length : end + 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
      } else if (ch === '$') {
        const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
        if (m) {
          quote = m[0];
          cur += m[0];
          i += m[0].length;
          continue;
        }
      } else if (ch === ';') {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
        i++;
        continue;
      }
    } else if (sql.startsWith(quote, i)) {
      cur += quote;
      i += quote.length;
      // '' or "" escape stays inside the literal
      if ((quote === "'" || quote === '"') && sql[i] === quote) {
        cur += quote;
        i++;
        continue;
      }
      quote = null;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ALLOWED: RegExp[] = [
  /^create\s+table\s+(if\s+not\s+exists\s+)?/i,
  /^create\s+(unique\s+)?index\s+/i,
  /^alter\s+table\s+(if\s+exists\s+)?("?[\w]+"?\.)?"?[\w]+"?\s+add\s+(column|constraint)\s+/i,
  /^insert\s+into\s+/i,
  /^create\s+extension\s+if\s+not\s+exists\s+"?vector"?$/i,
  /^comment\s+on\s+(table|column)\s+/i,
];

const FORBIDDEN = /\b(drop|truncate|delete|update|grant|revoke|copy|do|execute|function|procedure|trigger|role|user|database|pg_read_file|pg_ls_dir|lo_import|dblink)\b/i;
const RESERVED_TABLE = /\b(embeddings|pg_\w+|information_schema)\b/i;

export interface GuardResult {
  ok: boolean;
  statements: string[];
  errors: string[];
}

/** Allow only additive schema changes + seed inserts from LLM-generated SQL. */
export function guardDdl(sql: string): GuardResult {
  const statements = splitSqlStatements(sql);
  const errors: string[] = [];
  if (!statements.length) errors.push('No SQL statements');
  if (statements.length > 40) errors.push('Too many statements');
  for (const s of statements) {
    if (!ALLOWED.some((r) => r.test(s))) {
      errors.push(`Statement type not allowed: ${s.slice(0, 60)}`);
      continue;
    }
    // Check keywords outside string literals only.
    const noStrings = s
      .replace(/'(?:[^']|'')*'/g, "''")
      .replace(/\bon\s+(delete|update)\s+(cascade|restrict|no\s+action|set\s+null|set\s+default)\b/gi, '')
      .replace(/\bon\s+conflict\b[^)]*?\bdo\s+nothing\b/gi, '');
    if (FORBIDDEN.test(noStrings) && !/^create\s+extension/i.test(s)) {
      errors.push(`Forbidden keyword in: ${s.slice(0, 60)}`);
    }
    if (/^create\s+table/i.test(s) && RESERVED_TABLE.test(s.split('(')[0] ?? '')) {
      errors.push(`Reserved table name in: ${s.slice(0, 60)}`);
    }
  }
  return { ok: errors.length === 0, statements, errors };
}
