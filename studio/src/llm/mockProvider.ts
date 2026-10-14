import type { ChatMessage, LLMProvider } from './types';

/**
 * Deterministic offline provider. Only implements the orchestrator routing call;
 * Code/DB agents use their built-in templates when the provider id is 'mock'.
 */
export class MockLLMProvider implements LLMProvider {
  id = 'mock' as const;
  label = 'mock (offline)';

  async complete(messages: ChatMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const text = (lastUser?.content ?? '').toLowerCase();
    if (text.includes('todo')) {
      return JSON.stringify({
        routes: ['code', 'db', 'design'],
        summary: 'Scaffold a minimal todo app with persistence and hero artwork.',
        codeIntent: 'todo-app',
        dbIntent: 'todo-schema',
        designIntent: 'Minimal cyan-on-black abstract geometric hero for a todo app, dev aesthetic',
      });
    }
    return JSON.stringify({
      routes: ['code'],
      summary: 'Update the sandbox application.',
      codeIntent: 'generic',
    });
  }
}
