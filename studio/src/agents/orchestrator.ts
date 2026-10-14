import type { EventBroker } from '@/broker/eventBroker';
import type { DevstackDb } from '@/db/pgliteClient';
import { chunkMarkdown } from '@/db/embed';
import { assetFilename } from '@/image/dataUrl';
import type { ImageGenerator } from '@/image/types';
import { MockLLMProvider } from '@/llm/mockProvider';
import type { ChatMessage, LLMProvider } from '@/llm/types';
import type { SandboxFs } from '@/sandbox/types';
import { runCodeAgent } from './codeAgent';
import { appSchemaSql, runDbAgent } from './dbAgent';
import { runDesignAgent } from './designAgent';
import { ROUTER_SYSTEM } from './prompts';
import { mergeVaultIntoSystem, parseRoutePlan } from './router';
import type { RoutePlan } from './types';

export interface OrchestratorDeps {
  broker: EventBroker;
  getLlm: () => LLMProvider;
  fs: SandboxFs;
  getDb: () => DevstackDb | null;
  generateImage: ImageGenerator;
}

export interface RunReport {
  plan: RoutePlan;
  lines: string[];
  errors: string[];
}

/**
 * Core orchestrator: routes a prompt to DB/Code/Design agents.
 * DB runs first (its schema feeds CodeAgent), then Code and Design run in parallel.
 */
export class AgentOrchestrator {
  private vault: string[] = [];
  private running = false;

  constructor(private deps: OrchestratorDeps) {}

  isRunning(): boolean {
    return this.running;
  }

  async importMarkdown(name: string, doc: string): Promise<number> {
    this.vault.push(doc);
    const db = this.deps.getDb();
    if (!db) return 0;
    const chunks = chunkMarkdown(doc);
    return db.addKnowledge(
      chunks.map((c, i) => ({ source: 'vault', label: `${name} #${i + 1}`, content: c })),
    );
  }

  private async systemPrompt(prompt: string): Promise<string> {
    let system = mergeVaultIntoSystem(ROUTER_SYSTEM, this.vault);
    const db = this.deps.getDb();
    if (db && this.vault.length) {
      const hits = (await db.vectorSearch(prompt, 4)).filter((h) => h.source === 'vault' && h.distance < 0.95);
      if (hits.length) {
        system += `\n\n## Most relevant vault excerpts (pgvector cosine search)\n${hits
          .map((h) => `- (${h.distance.toFixed(3)}) ${h.label}: ${h.content}`)
          .join('\n')}`;
      }
    }
    return system;
  }

  async handleUserPrompt(prompt: string): Promise<RunReport> {
    const { broker } = this.deps;
    if (this.running) throw new Error('A run is already in progress');
    this.running = true;
    const lines: string[] = [];
    const errors: string[] = [];
    try {
      await broker.emit('agent:message', { role: 'user', content: prompt });
      await broker.emit('agent:thinking', { active: true, agent: 'orchestrator' });

      let llm = this.deps.getLlm();
      const messages: ChatMessage[] = [
        { role: 'system', content: await this.systemPrompt(prompt) },
        { role: 'user', content: prompt },
      ];
      let raw: string;
      try {
        raw = await llm.complete(messages, { json: true, maxTokens: 800 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await broker.emit('agent:message', {
          role: 'system',
          content: `LLM unavailable (${msg}). Falling back to the offline mock provider for this run.`,
        });
        llm = new MockLLMProvider();
        raw = await llm.complete(messages);
      }
      const plan = parseRoutePlan(raw, `Handle: ${prompt}`);
      await broker.emit('agent:route', { targets: plan.targets, reason: plan.summary });

      const db = this.deps.getDb();
      const isTodoTemplate = llm.id === 'mock' && /todo/i.test(`${plan.codeIntent ?? ''} ${prompt}`);
      const heroFile = assetFilename(isTodoTemplate ? 'todo-hero' : (plan.assetName ?? 'hero'));
      const willDesign = plan.targets.includes('design');

      let schemaSql = db ? await appSchemaSql(db).catch(() => '') : '';
      if (plan.targets.includes('db')) {
        if (!db) errors.push('DBAgent skipped: database not ready');
        else {
          try {
            const r = await runDbAgent(broker, db, llm, { intent: plan.dbIntent ?? prompt, userPrompt: prompt });
            schemaSql = r.schemaSql;
            lines.push(`DBAgent (${r.source}) → tables: ${r.tables.join(', ') || '—'}`);
            if (r.note) lines.push(`  ${r.note}`);
          } catch (err) {
            errors.push(`DBAgent failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      const tasks: Promise<void>[] = [];
      if (plan.targets.includes('code')) {
        tasks.push(
          runCodeAgent(broker, this.deps.fs, llm, {
            intent: plan.codeIntent ?? prompt,
            userPrompt: prompt,
            schemaSql,
            heroPath: willDesign ? `/assets/${heroFile}` : null,
          })
            .then((r) => {
              lines.push(`CodeAgent (${r.source}) → ${r.paths.join(', ')}`);
              if (r.note) lines.push(`  ${r.note}`);
            })
            .catch((err: unknown) => {
              errors.push(`CodeAgent failed: ${err instanceof Error ? err.message : String(err)}`);
            }),
        );
      }
      if (willDesign) {
        tasks.push(
          runDesignAgent(broker, this.deps.fs, this.deps.generateImage, {
            prompt: plan.designIntent ?? `Hero illustration for: ${prompt}`,
            filename: heroFile,
          })
            .then((img) => {
              lines.push(`DesignAgent (${img.source}) → ${img.path}`);
              if (img.fallbackReason) lines.push(`  image provider failed, used placeholder: ${img.fallbackReason}`);
            })
            .catch((err: unknown) => {
              errors.push(`DesignAgent failed: ${err instanceof Error ? err.message : String(err)}`);
            }),
        );
      }
      await Promise.all(tasks);

      const body = [...lines.map((l) => (l.startsWith('  ') ? l : `• ${l}`)), ...errors.map((e) => `✗ ${e}`)];
      await broker.emit('agent:message', {
        role: 'assistant',
        content: body.length ? `${plan.summary}\n\n${body.join('\n')}` : plan.summary,
      });
      return { plan, lines, errors };
    } finally {
      this.running = false;
      await broker.emit('agent:thinking', { active: false });
    }
  }
}
