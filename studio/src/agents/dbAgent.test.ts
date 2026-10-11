import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBroker } from '@/broker/eventBroker';
import { DevstackDb } from '@/db/pgliteClient';
import { MockLLMProvider } from '@/llm/mockProvider';
import { ScriptedLLM } from '@/test/fakes';
import { runDbAgent } from './dbAgent';

describe('runDbAgent', () => {
  let db: DevstackDb;
  beforeEach(async () => {
    db = new DevstackDb();
    await db.init();
  });
  afterEach(() => db.close());

  it('creates the todo schema with seed rows and indexes knowledge (mock)', async () => {
    const broker = new EventBroker();
    const changed: string[][] = [];
    broker.on('db:schema-changed', (p) => void changed.push(p.tables));
    const r = await runDbAgent(broker, db, new MockLLMProvider(), { intent: 'todo-schema', userPrompt: 'build a todo app' });
    expect(r).toMatchObject({ tables: ['todos'], createdOrChanged: ['todos'], source: 'template' });
    expect(r.schemaSql).toContain('CREATE TABLE IF NOT EXISTS "todos"');
    expect(await db.countRows('todos')).toBe(3);
    expect(changed).toEqual([['embeddings', 'todos']]);
    const hits = await db.vectorSearch('todos table columns', 2);
    expect(hits[0]?.source).toBe('schema');
    // idempotent: running again does not duplicate seeds
    await runDbAgent(broker, db, new MockLLMProvider(), { intent: 'todo-schema', userPrompt: 'build a todo app' });
    expect(await db.countRows('todos')).toBe(3);
  });

  it('applies guarded LLM DDL', async () => {
    const llm = new ScriptedLLM({
      db: [
        JSON.stringify({
          sql: `CREATE TABLE IF NOT EXISTS habits (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS checkins (id SERIAL PRIMARY KEY, habit_id INT NOT NULL REFERENCES habits(id), day DATE NOT NULL);`,
        }),
      ],
    });
    const r = await runDbAgent(new EventBroker(), db, llm, { intent: 'habits', userPrompt: 'habit tracker' });
    expect(r.source).toBe('llm');
    expect(r.tables).toEqual(['checkins', 'habits']);
    expect(await db.getRelations()).toHaveLength(1);
  });

  it('falls back to the template when LLM SQL is destructive', async () => {
    const llm = new ScriptedLLM({ db: [JSON.stringify({ sql: 'DROP TABLE embeddings;' })] });
    const r = await runDbAgent(new EventBroker(), db, llm, { intent: 'notes', userPrompt: 'notes app' });
    expect(r.source).toBe('template');
    expect(r.note).toMatch(/DDL rejected/);
    expect(r.tables).toEqual(['notes']);
    expect(await db.listTables()).toContain('embeddings');
  });
});
