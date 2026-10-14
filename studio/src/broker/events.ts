export type AgentKind = 'code' | 'design' | 'db' | 'orchestrator';

export type DevstackEventMap = {
  'agent:thinking': { active: boolean; agent?: AgentKind };
  'agent:message': { role: 'user' | 'assistant' | 'system'; content: string };
  'agent:route': { targets: AgentKind[]; reason: string };
  'code:files-written': { paths: string[]; source: 'llm' | 'template' };
  'design:image-requested': { prompt: string; filename: string };
  'design:image-ready': { path: string; dataUrl: string; source: 'proxy' | 'mock' };
  'db:schema-changed': { tables: string[] };
  'db:data-changed': { table?: string };
  'export:started': Record<string, never>;
  'export:complete': { filename: string; bytes: number };
};

export type DevstackEventName = keyof DevstackEventMap;

export type EventHandler<T extends DevstackEventName> = (
  payload: DevstackEventMap[T],
) => void | Promise<void>;
