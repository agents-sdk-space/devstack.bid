import { AgentOrchestrator } from '@/agents/orchestrator';
import { runDesignAgent } from '@/agents/designAgent';
import { EventBroker } from '@/broker/eventBroker';
import type { AgentKind } from '@/broker/events';
import type { DevstackDb, Relation, SchemaColumn, VectorHit } from '@/db/pgliteClient';
import { createImageGenerator } from '@/image/imageEngine';
import type { ImageGenerator } from '@/image/types';
import { resolveBackend } from '@/llm/createProvider';
import { MockLLMProvider } from '@/llm/mockProvider';
import type { LLMProvider } from '@/llm/types';
import type { HealthResponseBody } from '@/shared/apiTypes';
import { isMutation, validateBridgeSql } from '@/sandbox/dbBridge';
import { isBinaryPath } from '@/sandbox/paths';
import { ProjectFs } from '@/sandbox/projectFs';
import { getInitialSandboxFiles } from '@/sandbox/template';
import type { SandboxStatus } from '@/sandbox/types';
import { WebContainerSandbox } from '@/sandbox/webcontainer';
import { Store } from './store';
import { TerminalBuffer } from './terminalBuffer';

export type UiMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string };
export type Asset = { path: string; dataUrl: string; source: 'proxy' | 'mock' };

export interface DevstackState {
  messages: UiMessage[];
  thinking: boolean;
  thinkingAgent?: AgentKind;
  activeAgents: AgentKind[];
  backend: HealthResponseBody | null;
  llmLabel: string;
  files: Record<string, string>;
  /** Binary project files (images under public/assets) — listed in the tree, previewed as images. */
  binaryFiles: string[];
  activeFile: string;
  sandbox: SandboxStatus;
  previewUrl: string | null;
  previewNonce: number;
  assets: Asset[];
  assetPanelOpen: boolean;
  dbReady: boolean;
  dataInspectorOpen: boolean;
  tables: string[];
  rowCounts: Record<string, number>;
  schema: Record<string, SchemaColumn[]>;
  relations: Relation[];
  selectedTable: string;
  tableData: Record<string, unknown>[];
  vectorQuery: string;
  vectorResults: VectorHit[];
  sqlResult: { rows: Record<string, unknown>[]; error?: string; affected: number } | null;
  exportOpen: boolean;
  exporting: boolean;
  lastExport: { filename: string; files: string[]; bytes: number } | null;
}

let msgSeq = 0;
const nextId = () => `m${Date.now().toString(36)}-${msgSeq++}`;

export class DevstackRuntime {
  readonly broker = new EventBroker();
  readonly fs = new ProjectFs(getInitialSandboxFiles());
  private db: DevstackDb | null = null;
  private dbDataDir: string;
  readonly terminal = new TerminalBuffer();
  readonly store: Store<DevstackState>;
  private llm: LLMProvider = new MockLLMProvider();
  private generateImage: ImageGenerator = createImageGenerator(null);
  private sandbox: WebContainerSandbox;
  private orchestrator: AgentOrchestrator;
  private previewWindow: () => Window | null = () => null;
  private started = false;
  private disposers: (() => void)[] = [];
  private enableSandbox: boolean;

  constructor(opts: { dbDataDir?: string; enableSandbox?: boolean } = {}) {
    this.dbDataDir = opts.dbDataDir ?? 'idb://devstack-db';
    this.enableSandbox = opts.enableSandbox ?? true;
    this.store = new Store<DevstackState>({
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content:
            'DEVSTACK online. Describe an app (try “build a todo app”). CodeAgent writes the code, DBAgent designs tables in PGlite + pgvector, DesignAgent generates artwork. Import Markdown to ground the agents.',
        },
      ],
      thinking: false,
      activeAgents: [],
      backend: null,
      llmLabel: 'connecting…',
      files: this.fs.memory.textSnapshot(),
      binaryFiles: [],
      activeFile: 'src/App.jsx',
      sandbox: { phase: 'idle' },
      previewUrl: null,
      previewNonce: 0,
      assets: [],
      assetPanelOpen: true,
      dbReady: false,
      dataInspectorOpen: true,
      tables: [],
      rowCounts: {},
      schema: {},
      relations: [],
      selectedTable: '',
      tableData: [],
      vectorQuery: '',
      vectorResults: [],
      sqlResult: null,
      exportOpen: false,
      exporting: false,
      lastExport: null,
    });
    this.sandbox = new WebContainerSandbox({
      onOutput: (c) => this.terminal.write(c),
      onStatus: (s) => this.store.setState({ sandbox: s }),
      onPreviewUrl: (url) => this.store.setState((st) => ({ previewUrl: url, previewNonce: st.previewNonce + 1 })),
    });
    this.orchestrator = new AgentOrchestrator({
      broker: this.broker,
      getLlm: () => this.llm,
      fs: this.fs,
      getDb: () => this.db,
      generateImage: (p, f) => this.generateImage(p, f),
    });
  }

  /** Idempotent startup: backend discovery, DB, WebContainer, event wiring. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.wireEvents();

    void resolveBackend().then(({ health, llm }) => {
      this.llm = llm;
      this.generateImage = createImageGenerator(health);
      this.store.setState({ backend: health, llmLabel: llm.label });
    });

    // PGlite (~10 MB wasm) is loaded lazily so the shell paints first.
    void import('@/db/pgliteClient')
      .then(async ({ DevstackDb }) => {
        const db = new DevstackDb(this.dbDataDir);
        await db.init();
        this.db = db;
        this.store.setState({ dbReady: true });
        await this.refreshDb();
      })
      .catch((err: unknown) => {
        this.pushMessage('system', `Database failed to start: ${String(err)}`);
      });

    if (this.enableSandbox) {
      void this.sandbox
        .boot(this.fs.memory.snapshot(), (wcFs) => this.fs.attachMirror(wcFs))
        .then(async (lock) => {
          if (lock) await this.fs.writeFromMirror('package-lock.json', lock);
        })
        .catch(() => undefined);
    } else {
      this.store.setState({ sandbox: { phase: 'error', message: 'Sandbox disabled' } });
    }
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }

  private pushMessage(role: UiMessage['role'], content: string): void {
    this.store.setState((s) => ({ messages: [...s.messages, { id: nextId(), role, content }] }));
  }

  private wireEvents(): void {
    const b = this.broker;
    this.disposers.push(
      b.on('agent:message', (p) => this.pushMessage(p.role, p.content)),
      b.on('agent:thinking', (p) =>
        this.store.setState((s) => ({
          thinking: p.active,
          thinkingAgent: p.agent,
          activeAgents: p.active ? (p.agent && !s.activeAgents.includes(p.agent) ? [...s.activeAgents, p.agent] : s.activeAgents) : [],
        })),
      ),
      b.on('code:files-written', (p) => {
        const app = p.paths.find((x) => x.endsWith('App.jsx')) ?? p.paths[0];
        if (app) this.store.setState({ activeFile: app });
      }),
      b.on('design:image-ready', (p) =>
        this.store.setState((s) => ({
          assets: [...s.assets.filter((a) => a.path !== p.path), { path: p.path, dataUrl: p.dataUrl, source: p.source }],
        })),
      ),
      b.on('db:schema-changed', () => this.refreshDb()),
      b.on('db:data-changed', () => this.refreshDb()),
      this.fs.onChange((path, content) => {
        if (typeof content !== 'string' || isBinaryPath(path)) {
          this.store.setState((s) =>
            s.binaryFiles.includes(path) ? {} : { binaryFiles: [...s.binaryFiles, path].sort() },
          );
          return;
        }
        this.store.setState((s) => ({ files: { ...s.files, [path]: content } }));
      }),
    );

    const onMessage = (event: MessageEvent) => {
      const preview = this.previewWindow();
      if (!preview || event.source !== preview) return;
      const url = this.store.getState().previewUrl;
      if (url && new URL(url).origin !== event.origin) return;
      const data = event.data as { type?: string; id?: number };
      if (data?.type !== 'devstack:sql') return;
      const req = validateBridgeSql(data);
      const reply = (msg: Record<string, unknown>) =>
        (event.source as Window).postMessage({ type: 'devstack:sql:result', id: data.id, ...msg }, event.origin);
      if (typeof req === 'string') {
        reply({ error: req });
        return;
      }
      if (!this.db) {
        reply({ error: 'database not ready' });
        return;
      }
      const db = this.db;
      void db
        .run(req.sql, req.params)
        .then(async (r) => {
          reply({ rows: JSON.parse(JSON.stringify(r.rows)) as unknown });
          if (isMutation(req.sql)) {
            if (/^\s*(create|alter)/i.test(req.sql)) await b.emit('db:schema-changed', { tables: await db.listTables() });
            else await b.emit('db:data-changed', {});
          }
        })
        .catch((err: unknown) => reply({ error: err instanceof Error ? err.message : String(err) }));
    };
    window.addEventListener('message', onMessage);
    this.disposers.push(() => window.removeEventListener('message', onMessage));
  }

  private requireDb(): DevstackDb {
    if (!this.db) throw new Error('Database is still starting');
    return this.db;
  }

  setPreviewWindowGetter(fn: () => Window | null): void {
    this.previewWindow = fn;
  }

  async refreshDb(): Promise<void> {
    const db = this.db;
    if (!db) return;
    const tables = await db.listTables();
    const [schema, relations] = await Promise.all([db.getSchema(), db.getRelations()]);
    const rowCounts: Record<string, number> = {};
    for (const t of tables) rowCounts[t] = await db.countRows(t);
    const cur = this.store.getState().selectedTable;
    const appTables = tables.filter((t) => t !== 'embeddings');
    const selected =
      tables.includes(cur) && !(cur === 'embeddings' && appTables.length) ? cur : (appTables[0] ?? tables[0] ?? '');
    const tableData = selected ? await db.getTablePreview(selected) : [];
    this.store.setState({ tables, schema, relations, rowCounts, selectedTable: selected, tableData });
  }

  // ---------- actions ----------
  async sendPrompt(text: string): Promise<void> {
    if (!text.trim() || this.orchestrator.isRunning()) return;
    try {
      await this.orchestrator.handleUserPrompt(text.trim());
    } catch (err) {
      this.pushMessage('system', `Run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async importMarkdown(name: string, text: string): Promise<void> {
    const n = await this.orchestrator.importMarkdown(name, text);
    this.pushMessage('system', `Imported “${name}” (${text.length} chars) into the knowledge vault — ${n} chunks embedded in pgvector.`);
    await this.refreshDb();
  }

  setActiveFile(path: string): void {
    this.store.setState({ activeFile: path });
  }

  async updateFile(path: string, content: string): Promise<void> {
    await this.fs.writeFile(path, content);
  }

  async selectTable(t: string): Promise<void> {
    this.store.setState({ selectedTable: t, tableData: await this.requireDb().getTablePreview(t) });
  }

  async runVectorSearch(query: string): Promise<void> {
    const q = query.trim() || 'todo app tasks';
    this.store.setState({ vectorQuery: q, vectorResults: await this.requireDb().vectorSearch(q, 6) });
  }

  async runSql(sql: string): Promise<void> {
    try {
      const r = await this.requireDb().run(sql);
      this.store.setState({ sqlResult: { rows: JSON.parse(JSON.stringify(r.rows)) as Record<string, unknown>[], affected: r.affected } });
      await this.refreshDb();
    } catch (err) {
      this.store.setState({ sqlResult: { rows: [], affected: 0, error: err instanceof Error ? err.message : String(err) } });
    }
  }

  async generateAsset(prompt: string): Promise<void> {
    const name = prompt.split(/\s+/).slice(0, 4).join('-') || 'asset';
    await runDesignAgent(this.broker, this.fs, this.generateImage, { prompt, filename: name });
    await this.broker.emit('agent:thinking', { active: false });
  }

  async exportProject(): Promise<void> {
    this.store.setState({ exporting: true });
    try {
      await this.broker.emit('export:started', {});
      const { buildExportBundle, downloadBlob } = await import('@/export/exportEngine');
      const res = await buildExportBundle(this.fs, this.requireDb());
      const filename = 'devstack-export.zip';
      downloadBlob(res.blob, filename);
      this.store.setState({ lastExport: { filename, files: res.files, bytes: res.bytes } });
      await this.broker.emit('export:complete', { filename, bytes: res.bytes });
    } finally {
      this.store.setState({ exporting: false });
    }
  }

  startShell(cols: number, rows: number, onData: (d: string) => void) {
    return this.sandbox.startShell(cols, rows, onData);
  }
}
