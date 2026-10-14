import { introspectAll, type ColumnInfo, type SqlRunner, type TableInfo } from './introspect';

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

function pascal(name: string): string {
  const p = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[A-Za-z]/.test(p) ? p : `T${p}`;
}

function fieldName(col: string): { name: string; map?: string } {
  if (IDENT.test(col)) return { name: col };
  const clean = col.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]+/, '');
  return { name: clean || 'field', map: col };
}

interface PrismaType {
  type: string;
  attrs: string[];
  unsupported: boolean;
}

export function mapPgType(pgType: string): PrismaType {
  const isArray = pgType.endsWith('[]');
  const base = isArray ? pgType.slice(0, -2) : pgType;
  const r = (type: string, ...attrs: string[]): PrismaType => ({
    type: isArray ? `${type}[]` : type,
    attrs,
    unsupported: false,
  });
  let m: RegExpExecArray | null;
  if (base === 'integer') return r('Int');
  if (base === 'smallint') return r('Int', '@db.SmallInt');
  if (base === 'bigint') return r('BigInt');
  if (base === 'text') return r('String');
  if ((m = /^character varying\((\d+)\)$/.exec(base))) return r('String', `@db.VarChar(${m[1]})`);
  if (base === 'character varying') return r('String', '@db.VarChar');
  if ((m = /^character\((\d+)\)$/.exec(base))) return r('String', `@db.Char(${m[1]})`);
  if (base === 'boolean') return r('Boolean');
  if (base === 'timestamp with time zone') return r('DateTime', '@db.Timestamptz(6)');
  if (base === 'timestamp without time zone') return r('DateTime', '@db.Timestamp(6)');
  if (base === 'date') return r('DateTime', '@db.Date');
  if (base === 'jsonb') return r('Json');
  if (base === 'json') return r('Json', '@db.Json');
  if (base === 'double precision') return r('Float');
  if (base === 'real') return r('Float', '@db.Real');
  if ((m = /^numeric\((\d+),(\d+)\)$/.exec(base))) return r('Decimal', `@db.Decimal(${m[1]}, ${m[2]})`);
  if (base === 'numeric') return r('Decimal');
  if (base === 'uuid') return r('String', '@db.Uuid');
  if (base === 'bytea') return r('Bytes');
  return { type: `Unsupported("${pgType.replace(/"/g, '\\"')}")`, attrs: [], unsupported: true };
}

function mapDefault(c: ColumnInfo, t: PrismaType): string | null {
  const d = c.default;
  if (!d) return null;
  if (c.isSerial) return '@default(autoincrement())';
  if (/^(now\(\)|CURRENT_TIMESTAMP)$/i.test(d)) return '@default(now())';
  if (t.unsupported) return `@default(dbgenerated(${JSON.stringify(d)}))`;
  if (d === 'true' || d === 'false') return `@default(${d})`;
  if (/^-?\d+(\.\d+)?$/.test(d)) return `@default(${d})`;
  const lit = /^'((?:[^']|'')*)'::[\w\s]+$/.exec(d);
  if (lit && t.type.startsWith('String')) return `@default(${JSON.stringify((lit[1] ?? '').replace(/''/g, "'"))})`;
  if (/^gen_random_uuid\(\)$/.test(d)) return '@default(dbgenerated("gen_random_uuid()"))';
  return `@default(dbgenerated(${JSON.stringify(d)}))`;
}

export function buildPrismaSchema(tables: TableInfo[]): string {
  const usesVector = tables.some((t) => t.columns.some((c) => /^vector\b/.test(c.type)));
  const modelNames = new Map(tables.map((t) => [t.name, pascal(t.name)]));
  const backRelations = new Map<string, string[]>();

  const models = tables.map((t) => {
    const lines: string[] = [];
    const pk = t.constraints.find((c) => c.type === 'p');
    const uniques = t.constraints.filter((c) => c.type === 'u');
    const fks = t.constraints.filter((c) => c.type === 'f' && c.refTable && modelNames.has(c.refTable));
    const usedNames = new Set(t.columns.map((c) => fieldName(c.name).name));

    for (const c of t.columns) {
      const f = fieldName(c.name);
      const pt = mapPgType(c.type);
      const optional = !c.notNull && !pt.type.endsWith('[]') ? '?' : '';
      const attrs: string[] = [];
      if (pk && pk.columns.length === 1 && pk.columns[0] === c.name) attrs.push('@id');
      if (uniques.some((u) => u.columns.length === 1 && u.columns[0] === c.name)) attrs.push('@unique');
      const def = mapDefault(c, pt);
      if (def) attrs.push(def);
      attrs.push(...pt.attrs);
      if (f.map) attrs.push(`@map(${JSON.stringify(f.map)})`);
      lines.push(`  ${f.name} ${pt.type}${optional}${attrs.length ? ` ${attrs.join(' ')}` : ''}`);
    }

    for (const fk of fks) {
      const target = modelNames.get(fk.refTable as string) as string;
      const relName = `${t.name}_${fk.columns.join('_')}`;
      let field = `${(fk.refTable as string).replace(/[^A-Za-z0-9_]/g, '_')}_rel`;
      while (usedNames.has(field)) field += '_';
      usedNames.add(field);
      const nullable = fk.columns.some((col) => !t.columns.find((c) => c.name === col)?.notNull);
      lines.push(
        `  ${field} ${target}${nullable ? '?' : ''} @relation("${relName}", fields: [${fk.columns.map((c) => fieldName(c).name).join(', ')}], references: [${(fk.refColumns ?? []).map((c) => fieldName(c).name).join(', ')}])`,
      );
      const list = backRelations.get(fk.refTable as string) ?? [];
      list.push(`  ${t.name.replace(/[^A-Za-z0-9_]/g, '_')}_${fk.columns.join('_')}_back ${modelNames.get(t.name)}[] @relation("${relName}")`);
      backRelations.set(fk.refTable as string, list);
    }

    const blockAttrs: string[] = [];
    if (pk && pk.columns.length > 1) blockAttrs.push(`  @@id([${pk.columns.map((c) => fieldName(c).name).join(', ')}])`);
    for (const u of uniques.filter((x) => x.columns.length > 1)) {
      blockAttrs.push(`  @@unique([${u.columns.map((c) => fieldName(c).name).join(', ')}])`);
    }
    if (!pk && !uniques.length) blockAttrs.push('  @@ignore // no primary/unique key; Prisma Client cannot address rows');
    blockAttrs.push(`  @@map(${JSON.stringify(t.name)})`);
    return { table: t.name, name: modelNames.get(t.name) as string, lines, blockAttrs };
  });

  const body = models
    .map((m) => {
      const back = backRelations.get(m.table) ?? [];
      return `model ${m.name} {\n${[...m.lines, ...back].join('\n')}\n\n${m.blockAttrs.join('\n')}\n}`;
    })
    .join('\n\n');

  const generator = usesVector
    ? 'generator client {\n  provider        = "prisma-client-js"\n  previewFeatures = ["postgresqlExtensions"]\n}'
    : 'generator client {\n  provider = "prisma-client-js"\n}';
  const datasource = `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")${usesVector ? '\n  extensions = [vector]' : ''}\n}`;
  return `// Generated by DEVSTACK Export Engine\n${generator}\n\n${datasource}\n\n${body}\n`;
}

export async function exportPrismaSchema(db: SqlRunner): Promise<string> {
  return buildPrismaSchema(await introspectAll(db));
}
