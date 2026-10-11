import { introspectAll, quoteIdent, quoteLiteral, type ColumnInfo, type SqlRunner, type TableInfo } from './introspect';

function columnDdl(c: ColumnInfo): string {
  if (c.isSerial) {
    const serial = c.type === 'bigint' ? 'BIGSERIAL' : c.type === 'smallint' ? 'SMALLSERIAL' : 'SERIAL';
    return `  ${quoteIdent(c.name)} ${serial}${c.notNull ? ' NOT NULL' : ''}`;
  }
  const def = c.default ? ` DEFAULT ${c.default}` : '';
  return `  ${quoteIdent(c.name)} ${c.type}${c.notNull ? ' NOT NULL' : ''}${def}`;
}

export function tableDdl(t: TableInfo): string {
  const lines = t.columns.map(columnDdl);
  for (const con of t.constraints) {
    if (con.type === 'f') continue; // added after data load
    lines.push(`  CONSTRAINT ${quoteIdent(con.name)} ${con.def}`);
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(t.name)} (\n${lines.join(',\n')}\n);`;
}

/**
 * Produce a replayable PostgreSQL migration: schema (incl. pgvector), indexes, data, FKs and
 * sequence resets. Values are exported as text literals and cast by Postgres on insert,
 * which round-trips every type (timestamps, jsonb, vectors, booleans).
 */
export async function exportSql(db: SqlRunner, maxRowsPerTable = 10_000): Promise<string> {
  const tables = await introspectAll(db);
  const usesVector = tables.some((t) => t.columns.some((c) => /^vector\b/.test(c.type)));
  const out: string[] = [
    '-- DEVSTACK database migration (PostgreSQL 15+)',
    `-- Generated ${new Date().toISOString()}`,
    'BEGIN;',
  ];
  if (usesVector) out.push('CREATE EXTENSION IF NOT EXISTS vector;');

  for (const t of tables) {
    out.push('', `-- Table: ${t.name}`, tableDdl(t));
    for (const idx of t.indexes) {
      out.push(`${idx.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')};`);
    }
  }

  for (const t of tables) {
    if (!t.columns.length) continue;
    const select = t.columns.map((c) => `${quoteIdent(c.name)}::text AS ${quoteIdent(c.name)}`).join(', ');
    const pk = t.constraints.find((c) => c.type === 'p');
    const order = pk?.columns.length ? ` ORDER BY ${pk.columns.map(quoteIdent).join(', ')}` : '';
    const rows = await db.query<Record<string, string | null>>(
      `SELECT ${select} FROM ${quoteIdent(t.name)}${order} LIMIT ${maxRowsPerTable}`,
    );
    if (!rows.length) continue;
    out.push('', `-- Data: ${t.name} (${rows.length} rows)`);
    const colList = t.columns.map((c) => quoteIdent(c.name)).join(', ');
    for (const row of rows) {
      const vals = t.columns.map((c) => {
        const v = row[c.name];
        return v === null || v === undefined ? 'NULL' : quoteLiteral(v);
      });
      out.push(`INSERT INTO ${quoteIdent(t.name)} (${colList}) VALUES (${vals.join(', ')});`);
    }
    for (const c of t.columns.filter((x) => x.isSerial)) {
      out.push(
        `SELECT setval(pg_get_serial_sequence(${quoteLiteral(quoteIdent(t.name))}, ${quoteLiteral(c.name)}), COALESCE(MAX(${quoteIdent(c.name)}), 1), MAX(${quoteIdent(c.name)}) IS NOT NULL) FROM ${quoteIdent(t.name)};`,
      );
    }
  }

  for (const t of tables) {
    for (const con of t.constraints.filter((c) => c.type === 'f')) {
      out.push(`ALTER TABLE ${quoteIdent(t.name)} ADD CONSTRAINT ${quoteIdent(con.name)} ${con.def};`);
    }
  }
  out.push('', 'COMMIT;', '');
  return out.join('\n');
}
