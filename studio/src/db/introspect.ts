export interface SqlRunner {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  default: string | null;
  isSerial: boolean;
}

export interface ConstraintInfo {
  name: string;
  type: 'p' | 'u' | 'f' | 'c' | string;
  def: string;
  columns: string[];
  refTable?: string;
  refColumns?: string[];
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: string[];
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteLiteral(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

export async function listTableNames(db: SqlRunner): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`,
  );
  return rows.map((r) => r.name);
}

export async function introspectTable(db: SqlRunner, table: string): Promise<TableInfo> {
  const reg = `public.${quoteIdent(table)}`;
  const cols = await db.query<{ name: string; type: string; notnull: boolean; def: string | null }>(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS notnull, pg_get_expr(d.adbin, d.adrelid) AS def
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [reg],
  );
  const constraints = await db.query<{
    name: string;
    type: string;
    def: string;
    cols: string[] | null;
    reftable: string | null;
    refcols: string[] | null;
  }>(
    `SELECT con.conname AS name, con.contype::text AS type, pg_get_constraintdef(con.oid) AS def,
            ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n, o)
                  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
            fc.relname::text AS reftable,
            ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(n, o)
                  JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.o) AS refcols
     FROM pg_constraint con
     LEFT JOIN pg_class fc ON fc.oid = con.confrelid
     WHERE con.conrelid = $1::regclass
     ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END, con.conname`,
    [reg],
  );
  const constraintNames = new Set(constraints.map((c) => c.name));
  const idx = await db.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
    [table],
  );
  return {
    name: table,
    columns: cols.map((c) => ({
      name: c.name,
      type: c.type,
      notNull: c.notnull,
      default: c.def,
      isSerial: Boolean(c.def && /^nextval\(/.test(c.def)),
    })),
    constraints: constraints.map((c) => ({
      name: c.name,
      type: c.type,
      def: c.def,
      columns: c.cols ?? [],
      refTable: c.reftable ?? undefined,
      refColumns: c.refcols ?? undefined,
    })),
    indexes: idx.filter((i) => !constraintNames.has(i.indexname)).map((i) => i.indexdef),
  };
}

export async function introspectAll(db: SqlRunner): Promise<TableInfo[]> {
  const names = await listTableNames(db);
  const out: TableInfo[] = [];
  for (const n of names) out.push(await introspectTable(db, n));
  return out;
}
