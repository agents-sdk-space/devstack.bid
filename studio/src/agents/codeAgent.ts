import type { EventBroker } from '@/broker/eventBroker';
import { extractJsonObject } from '@/llm/json';
import type { ChatMessage, LLMProvider } from '@/llm/types';
import { normalizeProjectPath } from '@/sandbox/paths';
import { GENERIC_APP_JSX, TODO_APP_FILES } from '@/sandbox/template';
import type { SandboxFs } from '@/sandbox/types';
import { codeSystemPrompt } from './prompts';
import { checkModuleSyntax, checkRelativeImports } from './syntaxCheck';

export interface CodeAgentInput {
  intent: string;
  userPrompt: string;
  schemaSql: string;
  heroPath: string | null;
}

export interface CodeAgentResult {
  paths: string[];
  source: 'llm' | 'template';
  note?: string;
}

const PROTECTED = new Set(['src/main.jsx', 'src/devstackDb.js']);
const ALLOWED_PATH = /^src\/(?:[\w-]+\/)*[\w.-]+\.(jsx|js|css)$/;
const MAX_FILES = 10;
const MAX_FILE_CHARS = 60_000;
const MAX_ATTEMPTS = 2;

/** Validate LLM file output. Returns the accepted files or throws with the reason. */
export function validateGeneratedFiles(raw: unknown, existingPaths: Iterable<string> = []): Record<string, string> {
  if (!raw || typeof raw !== 'object') throw new Error('Output is not an object');
  const filesField = (raw as { files?: unknown }).files;
  const entries: [string, unknown][] = Array.isArray(filesField)
    ? filesField.map((f) => [String((f as { path?: unknown }).path ?? ''), (f as { content?: unknown }).content])
    : filesField && typeof filesField === 'object'
      ? Object.entries(filesField as Record<string, unknown>)
      : [];
  if (!entries.length) throw new Error('No files in output');
  if (entries.length > MAX_FILES) throw new Error(`Too many files (${entries.length})`);
  const out: Record<string, string> = {};
  for (const [rawPath, content] of entries) {
    const path = normalizeProjectPath(rawPath);
    if (!ALLOWED_PATH.test(path)) throw new Error(`Path not allowed: ${path}`);
    if (PROTECTED.has(path)) throw new Error(`Protected file: ${path}`);
    if (typeof content !== 'string' || !content.trim()) throw new Error(`Empty content: ${path}`);
    if (content.length > MAX_FILE_CHARS) throw new Error(`File too large: ${path}`);
    out[path] = content;
  }
  const app = out['src/App.jsx'];
  if (!app) throw new Error('src/App.jsx missing');
  if (!/export\s+default\s+/.test(app)) throw new Error('src/App.jsx has no default export');
  for (const [path, content] of Object.entries(out)) {
    for (const m of content.matchAll(/^\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm)) {
      const spec = m[1] as string;
      if (spec === 'react' || spec === 'react-dom' || spec.startsWith('react/') || spec.startsWith('./') || spec.startsWith('../')) continue;
      throw new Error(`${path} imports unavailable package "${spec}"`);
    }
    const syntax = checkModuleSyntax(path, content);
    if (syntax) throw new Error(`Syntax error in ${syntax}`);
  }
  const missing = checkRelativeImports(out, existingPaths);
  if (missing) throw new Error(missing);
  return out;
}

function templateFiles(intent: string): Record<string, string> {
  return /todo/i.test(intent) ? TODO_APP_FILES : { 'src/App.jsx': GENERIC_APP_JSX(intent) };
}

export async function runCodeAgent(
  broker: EventBroker,
  fs: SandboxFs,
  llm: LLMProvider,
  input: CodeAgentInput,
): Promise<CodeAgentResult> {
  await broker.emit('agent:thinking', { active: true, agent: 'code' });
  let files: Record<string, string>;
  let source: CodeAgentResult['source'] = 'template';
  let note: string | undefined;

  if (llm.id === 'mock') {
    files = templateFiles(`${input.intent} ${input.userPrompt}`);
  } else {
    const existing = await fs.listFiles();
    const messages: ChatMessage[] = [
      { role: 'system', content: codeSystemPrompt({ schemaSql: input.schemaSql, heroPath: input.heroPath }) },
      { role: 'user', content: `Request: ${input.userPrompt}\nUI intent: ${input.intent}` },
    ];
    let accepted: Record<string, string> | null = null;
    let lastError = '';
    // Generate -> validate (paths, imports, JSX syntax) -> repair with the error, up to MAX_ATTEMPTS.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !accepted; attempt++) {
      let raw = '';
      try {
        raw = await llm.complete(messages, { json: true, maxTokens: 7000, temperature: 0.2 });
        accepted = validateGeneratedFiles(extractJsonObject(raw), existing);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (!raw) break; // transport failure: don't retry
        messages.push(
          { role: 'assistant', content: raw.slice(0, 20_000) },
          { role: 'user', content: `Your output was rejected: ${lastError}. Return the corrected complete JSON object.` },
        );
      }
    }
    if (accepted) {
      files = accepted;
      source = 'llm';
    } else {
      note = `LLM code generation rejected (${lastError}); used built-in template`;
      files = templateFiles(`${input.intent} ${input.userPrompt}`);
    }
  }

  const paths: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    await fs.writeFile(path, content);
    paths.push(path);
  }
  await broker.emit('code:files-written', { paths, source });
  return { paths, source, note };
}
