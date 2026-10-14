import type { ChatMessage } from '@/shared/apiTypes';

export type { ChatMessage };

export interface CompletionOptions {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  /** 'mock' for the deterministic offline provider, 'proxy' for the server-side proxy. */
  id: 'mock' | 'proxy';
  label: string;
  complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<string>;
}
