import { API_PATHS } from '@/shared/apiPaths';
import type { ChatResponseBody } from '@/shared/apiTypes';
import type { ChatMessage, CompletionOptions, LLMProvider } from './types';

/** Calls the devstack.bid Studio proxy (/api/studio/llm/chat). No key ever reaches the browser. */
export class ProxyLLMProvider implements LLMProvider {
  id = 'proxy' as const;

  constructor(
    public label: string,
    private endpoint: string = API_PATHS.chat,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async complete(messages: ChatMessage[], opts: CompletionOptions = {}): Promise<string> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        json: opts.json,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: string }).error ?? '';
      } catch {
        /* ignore */
      }
      throw new Error(`LLM proxy failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    const data = (await res.json()) as ChatResponseBody;
    return data.content;
  }
}
