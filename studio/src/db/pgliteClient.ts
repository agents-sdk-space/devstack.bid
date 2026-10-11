import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { KNOWLEDGE_TABLE } from './constants';
import { EMBED_DIM, embedText, toPgVector } from './embed';
import { guardDdl } from './ddlGuard';
import { introspectAll, introspectTable, listTableNames, quoteIdent, type SqlRunner, type TableInfo } from './introspect';
import { exportPrismaSchema } from './prismaExport';
import { exportSql } from './sqlExport';

export interface VectorHit {
  id: number;
  label: string;
  source: string;
  content: string;
  distance: number;
}

export interface SchemaColumn {
  column: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primaryKey: boolean;
}

export interface Relation {
  from: string;
  fromColumns: string[];
  to: string;
  toColumns: string[];
}

export { KNOWLEDGE_TABLE };

/**
 * In-browser Postgres (PGlite) with native pgvector.
 * `dataDir`: 'idb://devstack-db' in the browser, undefined/'memory://' in tests.
 */
export class DevstackDb implements SqlRunner {
  private db: PGlite | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private dataDir?: string) {}

  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const db = await PGlite.create({ dataDir: this.dataDir, extensions: { vector } });
    await db.exec(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS ${KNOWLEDGE_TABLE} (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'note',
        label TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        embedding vector(${EMBED_DIM}) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx ON ${KNOWLEDGE_TABLE} USING hnsw (embedding vector_cosine_ops);
    `);
    this.db = db;
  }

  private client(): PGlite {
    if (!this.db) throw new Error('DB not initialized');
    return this.db;
  }

  async close(): Promise<void> {
    await this.db?.close();
    this.db = null;
    this.initPromise = null;
  }

  async exec(sql: string): Promise<void> {
    await this.client().exec(sql);
  }

  async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client().query<T>(sql, params);
    return res.rows;
  }

  /** Run arbitrary SQL from the Data Inspector console / sandbox bridge. */
  async run(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; affected: number }> {
    if (params.length) {
      const r = await this.client().query<Record<string, unknown>>(sql, params);
      return { rows: r.rows, affected: r.affectedRows ?? 0 };
    }
    const results = await this.client().exec(sql);
    const last = results[results.length - 1];
    return { rows: (last?.rows ?? []) as Record<string, unknown>[], affected: last?.affectedRows ?? 0 };
  }

  /** Apply guarded (additive-only) DDL atomically. Throws with the guard errors when rejected. */
  async applyGuardedDdl(sql: string): Promise<string[]> {
    const g = guardDdl(sql);
    if (!g.ok) throw new Error(`DDL rejected: ${g.errors.join('; ')}`);
    await this.client().transaction(async (tx) => {
      for (const s of g.statements) await tx.exec(s);
    });
    return g.statements;
  }

  listTables(): Promise<string[]> {
    return listTableNames(this);
  }

  async getTablePreview(table: string, limit = 50): Promise<Record<string, unknown>[]> {
    const tables = await this.listTables();
    if (!tables.includes(table)) return [];
    const pk = (await introspectTable(this, table)).constraints.find((c) => c.type === 'p')?.columns ?? [];
    const order = pk.length ? ` ORDER BY ${pk.map(quoteIdent).join(', ')}` : '';
    const cols =
      table === KNOWLEDGE_TABLE
        ? `id, source, label, left(content, 80) AS content, left(embedding::text, 48) || '…' AS embedding, created_at`
        : '*';
    return this.query(`SELECT ${cols} FROM ${quoteIdent(table)}${order} LIMIT ${Math.max(1, Math.min(limit, 1000))}`);
  }

  async countRows(table: string): Promise<number> {
    const rows = await this.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${quoteIdent(table)}`);
    return rows[0]?.n ?? 0;
  }

  introspect(): Promise<TableInfo[]> {
    return introspectAll(this);
  }

  async getSchema(): Promise<Record<string, SchemaColumn[]>> {
    const out: Record<string, SchemaColumn[]> = {};
    for (const t of await this.introspect()) {
      const pk = t.constraints.find((c) => c.type === 'p')?.columns ?? [];
      out[t.name] = t.columns.map((c) => ({
        column: c.name,
        type: c.type,
        nullable: !c.notNull,
        default: c.default,
        primaryKey: pk.includes(c.name),
      }));
    }
    return out;
  }

  async getRelations(): Promise<Relation[]> {
    const rels: Relation[] = [];
    for (const t of await this.introspect()) {
      for (const c of t.constraints) {
        if (c.type === 'f' && c.refTable) {
          rels.push({ from: t.name, fromColumns: c.columns, to: c.refTable, toColumns: c.refColumns ?? [] });
        }
      }
    }
    return rels;
  }

  async addKnowledge(entries: { source: string; label: string; content: string }[]): Promise<number> {
    let n = 0;
    for (const e of entries) {
      const vec = toPgVector(embedText(`${e.label}\n${e.content}`));
      await this.query(
        `INSERT INTO ${KNOWLEDGE_TABLE} (source, label, content, embedding) VALUES ($1, $2, $3, $4::vector)`,
        [e.source, e.label.slice(0, 200), e.content, vec],
      );
      n++;
    }
    return n;
  }

  async clearKnowledge(source: string): Promise<void> {
    await this.query(`DELETE FROM ${KNOWLEDGE_TABLE} WHERE source = $1`, [source]);
  }

  /** Native pgvector cosine-distance search (`<=>`), served by the HNSW index. */
  async vectorSearch(query: string | number[], topK = 5): Promise<VectorHit[]> {
    const vec = typeof query === 'string' ? embedText(query) : query;
    return this.query<VectorHit & Record<string, unknown>>(
      `SELECT id, label, source, left(content, 160) AS content, (embedding <=> $1::vector)::float8 AS distance
       FROM ${KNOWLEDGE_TABLE} ORDER BY embedding <=> $1::vector LIMIT $2`,
      [toPgVector(vec), Math.max(1, Math.min(topK, 50))],
    );
  }

  exportSql(): Promise<string> {
    return exportSql(this);
  }

  exportPrismaSchema(): Promise<string> {
    return exportPrismaSchema(this);
  }
}
