import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TODO_SCHEMA } from '@/agents/dbAgent';
import { DevstackDb } from './pgliteClient';

describe('DevstackDb (PGlite + native pgvector)', () => {
  const db = new DevstackDb();

  beforeAll(async () => {
    await db.init();
    await db.applyGuardedDdl(TODO_SCHEMA);
    await db.applyGuardedDdl(`
      CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE, meta JSONB, budget NUMERIC(10,2));
      ALTER TABLE todos ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
      INSERT INTO projects (name, meta, budget) VALUES ('Launch', '{"tier":"gold","quote":"it''s"}', 12.5);
    `);
    await db.run(`UPDATE todos SET project_id = 1 WHERE id = 1`);
  });
  afterAll(() => db.close());

  it('creates the vector extension, knowledge table and HNSW index', async () => {
    const ext = await db.query<{ extname: string }>(`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
    expect(ext).toHaveLength(1);
    const schema = await db.getSchema();
    expect(schema.embeddings?.find((c) => c.column === 'embedding')?.type).toBe('vector(128)');
    const idx = await db.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE tablename = 'embeddings'`);
    expect(idx.some((i) => i.indexdef.includes('hnsw'))).toBe(true);
  });

  it('lists tables, rows, schema and relations', async () => {
    expect(await db.listTables()).toEqual(['embeddings', 'projects', 'todos']);
    expect(await db.countRows('todos')).toBe(3);
    const preview = await db.getTablePreview('todos');
    expect(preview[0]).toMatchObject({ title: 'Ship the DEVSTACK demo', done: false });
    expect(await db.getTablePreview('nope"; DROP TABLE todos; --')).toEqual([]);
    const schema = await db.getSchema();
    expect(schema.todos?.find((c) => c.column === 'id')).toMatchObject({ primaryKey: true, nullable: false });
    expect(await db.getRelations()).toEqual([
      { from: 'todos', fromColumns: ['project_id'], to: 'projects', toColumns: ['id'] },
    ]);
  });

  it('rejects destructive DDL atomically', async () => {
    await expect(db.applyGuardedDdl('CREATE TABLE IF NOT EXISTS x (id int primary key); DROP TABLE todos;')).rejects.toThrow(/rejected/);
    expect(await db.listTables()).not.toContain('x');
  });

  it('runs native cosine search ordered by distance', async () => {
    await db.addKnowledge([
      { source: 'vault', label: 'auth', content: 'Users sign in with email magic links and sessions' },
      { source: 'vault', label: 'billing', content: 'Stripe invoices, subscriptions and payment webhooks' },
      { source: 'vault', label: 'todos', content: 'Todo items have a title, done flag and due date' },
    ]);
    const hits = await db.vectorSearch('todo item title done', 3);
    expect(hits).toHaveLength(3);
    expect(hits[0]?.label).toBe('todos');
    for (let i = 1; i < hits.length; i++) expect(hits[i]!.distance).toBeGreaterThanOrEqual(hits[i - 1]!.distance);
    expect(hits.every((h) => typeof h.distance === 'number' && h.distance >= 0 && h.distance <= 2)).toBe(true);
    // Verify pgvector's operator matches the expected math for an identical vector.
    const self = await db.vectorSearch('Todo items have a title, done flag and due date', 1);
    expect(self[0]?.label).toBe('todos');
  });

  it('runs console SQL with and without params', async () => {
    const r = await db.run('SELECT count(*)::int AS n FROM todos WHERE done = $1', [false]);
    expect(r.rows[0]).toEqual({ n: 3 });
    const multi = await db.run('SELECT 1 AS a; SELECT 2 AS b;');
    expect(multi.rows).toEqual([{ b: 2 }]);
  });

  it('exports SQL that replays into a fresh Postgres with identical data', async () => {
    const sql = await db.exportSql();
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector;');
    expect(sql).toContain('"embedding" vector(128) NOT NULL');
    expect(sql).toContain('USING hnsw');
    expect(sql).toMatch(/ALTER TABLE "todos" ADD CONSTRAINT .* FOREIGN KEY \(project_id\) REFERENCES projects\(id\) ON DELETE CASCADE/);

    const fresh = await PGlite.create({ extensions: { vector } });
    await fresh.exec(sql);
    const a = await db.query(`SELECT id, title, done, project_id, created_at::text FROM todos ORDER BY id`);
    const b = (await fresh.query(`SELECT id, title, done, project_id, created_at::text FROM todos ORDER BY id`)).rows;
    expect(b).toEqual(a);
    const meta = (await fresh.query<{ meta: unknown; budget: string }>(`SELECT meta, budget::text AS budget FROM projects`)).rows[0];
    expect(meta).toEqual({ meta: { tier: 'gold', quote: "it's" }, budget: '12.50' });
    const vec = (await fresh.query<{ n: number }>(`SELECT count(*)::int AS n FROM embeddings WHERE embedding IS NOT NULL`)).rows[0];
    expect(vec?.n).toBe(await db.countRows('embeddings'));
    // sequences were reset: next insert does not collide
    const next = (await fresh.query<{ id: number }>(`INSERT INTO todos (title) VALUES ('after') RETURNING id`)).rows[0];
    expect(next?.id).toBe(4);
    await fresh.close();
  });

  it('exports a Prisma schema with types, defaults, relations and pgvector', async () => {
    const prisma = await db.exportPrismaSchema();
    expect(prisma).toContain('provider = "postgresql"');
    expect(prisma).toContain('extensions = [vector]');
    expect(prisma).toContain('previewFeatures = ["postgresqlExtensions"]');
    expect(prisma).toMatch(/model Todos \{[\s\S]*id Int @id @default\(autoincrement\(\)\)/);
    expect(prisma).toContain('done Boolean @default(false)');
    expect(prisma).toContain('created_at DateTime @default(now()) @db.Timestamptz(6)');
    expect(prisma).toContain('embedding Unsupported("vector(128)")');
    expect(prisma).toContain('name String @unique @db.VarChar(80)');
    expect(prisma).toContain('meta Json?');
    expect(prisma).toContain('budget Decimal? @db.Decimal(10, 2)');
    expect(prisma).toMatch(/projects_rel Projects\? @relation\("todos_project_id", fields: \[project_id\], references: \[id\]\)/);
    expect(prisma).toContain('todos_project_id_back Todos[] @relation("todos_project_id")');
    expect(prisma).toContain('@@map("todos")');
  });
});
