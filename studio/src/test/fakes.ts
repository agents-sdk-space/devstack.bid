import type { ImageGenerator } from '@/image/types';
import type { ChatMessage, CompletionOptions, LLMProvider } from '@/llm/types';

/** Scripted "real" provider: responds based on which agent's system prompt it receives. */
export class ScriptedLLM implements LLMProvider {
  id = 'proxy' as const;
  label = 'scripted';
  calls: { messages: ChatMessage[]; opts?: CompletionOptions }[] = [];

  constructor(private handlers: { route?: string[]; code?: string[]; db?: string[] }) {}

  async complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string> {
    this.calls.push({ messages, opts });
    const sys = messages[0]?.content ?? '';
    const key = sys.includes('Core Orchestrator') ? 'route' : sys.includes('CodeAgent') ? 'code' : 'db';
    const queue = this.handlers[key];
    const next = queue?.shift();
    if (next === undefined) throw new Error(`no scripted response for ${key}`);
    if (next === '__THROW__') throw new Error('LLM proxy failed (502)');
    return next;
  }
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const fakeImageGenerator: ImageGenerator = async (_prompt, filename) => ({
  path: `public/assets/${filename}`,
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  bytes: PNG_BYTES,
  source: 'proxy',
});
