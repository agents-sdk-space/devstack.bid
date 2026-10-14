import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBroker } from '@/broker/eventBroker';
import { DevstackDb } from '@/db/pgliteClient';
import { MockLLMProvider } from '@/llm/mockProvider';
import type { LLMProvider } from '@/llm/types';
import { MemoryFs } from '@/sandbox/memoryFs';
import { getInitialSandboxFiles } from '@/sandbox/template';
import { fakeImageGenerator, PNG_BYTES, ScriptedLLM } from '@/test/fakes';
import { AgentOrchestrator } from './orchestrator';

function setup(llm: LLMProvider, db: DevstackDb | null) {
  const broker = new EventBroker();
  const fs = new MemoryFs(getInitialSandboxFiles());
  const orch = new AgentOrchestrator({ broker, getLlm: () => llm, fs, getDb: () => db, generateImage: fakeImageGenerator });
  const messages: { role: string; content: string }[] = [];
  const thinking: boolean[] = [];
  broker.on('agent:message', (m) => void messages.push(m));
  broker.on('agent:thinking', (t) => void thinking.push(t.active));
  return { broker, fs, orch, messages, thinking };
}

describe('AgentOrchestrator', () => {
  let db: DevstackDb;
  beforeEach(async () => {
    db = new DevstackDb();
    await db.init();
  });
  afterEach(() => db.close());

  it('runs the full todo flow offline: DB + code + image into the sandbox FS', async () => {
    const { fs, orch, messages, thinking, broker } = setup(new MockLLMProvider(), db);
    const routes: string[][] = [];
    broker.on('agent:route', (r) => void routes.push(r.targets));
    const report = await orch.handleUserPrompt('build a todo app');
    expect(report.errors).toEqual([]);
    expect(routes).toEqual([['code', 'db', 'design']]);
    expect(await db.listTables()).toContain('todos');
    expect(await fs.readFile('src/App.jsx')).toContain('/assets/todo-hero.png');
    expect(await fs.readBinary('public/assets/todo-hero.png')).toEqual(PNG_BYTES);
    expect(messages[0]).toEqual({ role: 'user', content: 'build a todo app' });
    const summary = messages.at(-1)?.content ?? '';
    expect(summary).toContain('DBAgent (template) → tables: todos');
    expect(summary).toContain('CodeAgent (template) → src/App.jsx');
    expect(summary).toContain('DesignAgent (proxy) → public/assets/todo-hero.png');
    expect(thinking.at(-1)).toBe(false);
    expect(orch.isRunning()).toBe(false);
  });

  it('uses the real-provider path: routing JSON, DB schema feeds CodeAgent prompt, hero path wired', async () => {
    const app = `import { sql } from './devstackDb.js';\nexport default function App() { return <main><h1>Habits</h1><img src="/assets/habit-hero.png" alt="" /></main>; }`;
    const llm = new ScriptedLLM({
      route: [JSON.stringify({ routes: ['db', 'code', 'design'], summary: 'Habit tracker', codeIntent: 'habit UI', dbIntent: 'habits', designIntent: 'neon habit art', assetName: 'Habit Hero' })],
      db: [JSON.stringify({ sql: 'CREATE TABLE IF NOT EXISTS habits (id SERIAL PRIMARY KEY, name TEXT NOT NULL);' })],
      code: [JSON.stringify({ files: [{ path: 'src/App.jsx', content: app }] })],
    });
    const { fs, orch } = setup(llm, db);
    const report = await orch.handleUserPrompt('habit tracker');
    expect(report.errors).toEqual([]);
    expect(report.plan.summary).toBe('Habit tracker');
    const codeCall = llm.calls.find((c) => c.messages[0]?.content.includes('CodeAgent'));
    expect(codeCall?.messages[0]?.content).toContain('CREATE TABLE IF NOT EXISTS "habits"');
    expect(codeCall?.messages[0]?.content).toContain('/assets/habit-hero.png');
    expect(await fs.readFile('src/App.jsx')).toBe(app);
    expect(await fs.listFiles()).toContain('public/assets/habit-hero.png');
  });

  it('falls back to the mock router when the LLM proxy fails', async () => {
    const llm = new ScriptedLLM({ route: ['__THROW__'] });
    const { orch, messages } = setup(llm, db);
    const report = await orch.handleUserPrompt('build a todo app');
    expect(messages.some((m) => m.role === 'system' && m.content.includes('Falling back'))).toBe(true);
    expect(report.lines.some((l) => l.includes('CodeAgent (template)'))).toBe(true);
  });

  it('reports agent failures without aborting the run', async () => {
    const { orch } = setup(new MockLLMProvider(), null);
    const report = await orch.handleUserPrompt('build a todo app');
    expect(report.errors).toContain('DBAgent skipped: database not ready');
    expect(report.lines.some((l) => l.startsWith('CodeAgent'))).toBe(true);
  });

  it('embeds imported Markdown and grounds routing with pgvector hits', async () => {
    const llm = new ScriptedLLM({ route: [JSON.stringify({ routes: ['code'], summary: 'x' })], code: ['bad'] });
    const { orch } = setup(llm, db);
    const n = await orch.importMarkdown('rules.md', '# Billing\nUse Stripe for invoices.\n\n# Todos\nTodos must have due dates and priorities.');
    expect(n).toBeGreaterThan(0);
    await orch.handleUserPrompt('add due dates to todos');
    const sys = llm.calls[0]?.messages[0]?.content ?? '';
    expect(sys).toContain('Imported knowledge vault');
    expect(sys).toContain('Most relevant vault excerpts (pgvector cosine search)');
    expect(sys.indexOf('Todos must have due dates')).toBeGreaterThan(-1);
  });

  it('rejects concurrent runs', async () => {
    const { orch } = setup(new MockLLMProvider(), db);
    const first = orch.handleUserPrompt('build a todo app');
    await expect(orch.handleUserPrompt('again')).rejects.toThrow(/in progress/);
    await first;
  });
});
