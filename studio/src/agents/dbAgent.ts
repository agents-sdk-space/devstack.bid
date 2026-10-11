import type { EventBroker } from '@/broker/eventBroker';
import { KNOWLEDGE_TABLE } from '@/db/constants';
import type { DevstackDb } from '@/db/pgliteClient';
import { tableDdl } from '@/db/sqlExport';
import { extractJsonObject } from '@/llm/json';
import type { LLMProvider } from '@/llm/types';
import { dbSystemPrompt } from './prompts';

export const TODO_SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO todos (title)
  SELECT v.title FROM (VALUES ('Ship the DEVSTACK demo'), ('Write integration tests'), ('Design the hero image')) AS v(title)
  WHERE NOT EXISTS (SELECT 1 FROM todos);
`;

export const NOTES_SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export interface DbAgentInput {
  intent: string;
  userPrompt: string;
}

export interface DbAgentResult {
  tables: string[];
  createdOrChanged: string[];
  source: 'llm' | 'template';
  schemaSql: string;
  note?: string;
}

/** DDL for the app tables (excludes the internal knowledge/embeddings table). */
export async function appSchemaSql(db: DevstackDb): Promise<string> {
  const infos = (await db.introspect()).filter((t) => t.name !== KNOWLEDGE_TABLE);
  return infos.map(tableDdl).join('\n\n');
}

export async function runDbAgent(
  broker: EventBroker,
  db: DevstackDb,
  llm: LLMProvider,
  input: DbAgentInput,
): Promise<DbAgentResult> {
  await broker.emit('agent:thinking', { active: true, agent: 'db' });
  const before = new Set(await db.listTables());
  let source: DbAgentResult['source'] = 'template';
  let note: string | undefined;
  const template = /todo/i.test(`${input.intent} ${input.userPrompt}`) ? TODO_SCHEMA : NOTES_SCHEMA;

  if (llm.id === 'mock') {
    await db.applyGuardedDdl(template);
  } else {
    try {
      const raw = await llm.complete(
        [
          { role: 'system', content: dbSystemPrompt([...before].filter((t) => t !== KNOWLEDGE_TABLE)) },
          { role: 'user', content: `Request: ${input.userPrompt}\nData intent: ${input.intent}` },
        ],
        { json: true, maxTokens: 2000, temperature: 0.1 },
      );
      const parsed = extractJsonObject(raw) as { sql?: unknown };
      if (typeof parsed.sql !== 'string') throw new Error('missing "sql"');
      await db.applyGuardedDdl(parsed.sql);
      source = 'llm';
    } catch (err) {
      note = `LLM schema rejected (${err instanceof Error ? err.message : String(err)}); used built-in template`;
      await db.applyGuardedDdl(template);
    }
  }

  const tables = await db.listTables();
  const appTables = tables.filter((t) => t !== KNOWLEDGE_TABLE);
  const schemaSql = await appSchemaSql(db);

  // Index the schema + request as knowledge for RAG / vector search.
  const infos = (await db.introspect()).filter((t) => t.name !== KNOWLEDGE_TABLE);
  await db.clearKnowledge('schema');
  await db.addKnowledge([
    ...infos.map((t) => ({
      source: 'schema',
      label: `table ${t.name}`,
      content: `Table ${t.name} columns: ${t.columns.map((c) => `${c.name} ${c.type}`).join(', ')}`,
    })),
    { source: 'prompt', label: input.userPrompt.slice(0, 120), content: `${input.userPrompt}\n${input.intent}` },
  ]);

  await broker.emit('db:schema-changed', { tables });
  return {
    tables: appTables,
    createdOrChanged: appTables.filter((t) => !before.has(t)),
    source,
    schemaSql,
    note,
  };
}
