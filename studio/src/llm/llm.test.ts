import { describe, expect, it, vi } from 'vitest';
import { resolveBackend } from './createProvider';
import { extractJsonObject } from './json';
import { MockLLMProvider } from './mockProvider';
import { ProxyLLMProvider } from './proxyProvider';

describe('extractJsonObject', () => {
  it('handles plain, fenced and prose-wrapped JSON', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject('Here you go: {"a":3} thanks')).toEqual({ a: 3 });
    expect(() => extractJsonObject('nothing')).toThrow();
  });
});

describe('ProxyLLMProvider', () => {
  it('posts to the server proxy and never sends a key', async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) =>
      new Response(JSON.stringify({ content: 'hi', model: 'm' }), { status: 200 }),
    );
    const p = new ProxyLLMProvider('label', '/api/studio/llm/chat', fetchImpl as unknown as typeof fetch);
    expect(await p.complete([{ role: 'user', content: 'x' }], { json: true, maxTokens: 10 })).toBe('hi');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/studio/llm/chat');
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    expect(JSON.parse(init.body as string)).toEqual({ messages: [{ role: 'user', content: 'x' }], json: true, maxTokens: 10 });
  });

  it('surfaces proxy errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'Upstream LLM error' }), { status: 502 }));
    const p = new ProxyLLMProvider('l', '/api/studio/llm/chat', fetchImpl as unknown as typeof fetch);
    await expect(p.complete([{ role: 'user', content: 'x' }])).rejects.toThrow('LLM proxy failed (502): Upstream LLM error');
  });
});

describe('resolveBackend', () => {
  it('uses the proxy when the server has a key', async () => {
    const health = { ok: true, llm: true, image: true, provider: 'Vercel AI Gateway', model: 'openai/gpt-4.1-mini', imageModel: 'x' };
    const r = await resolveBackend((async () => new Response(JSON.stringify(health))) as unknown as typeof fetch);
    expect(r.llm.id).toBe('proxy');
    expect(r.llm.label).toBe('Vercel AI Gateway · openai/gpt-4.1-mini');
  });

  it('falls back to mock when unconfigured or unreachable', async () => {
    const off = await resolveBackend((async () => new Response(JSON.stringify({ ok: true, llm: false }))) as unknown as typeof fetch);
    expect(off.llm.id).toBe('mock');
    const down = await resolveBackend((async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch);
    expect(down).toMatchObject({ health: null });
    expect(down.llm).toBeInstanceOf(MockLLMProvider);
  });
});

describe('MockLLMProvider', () => {
  it('routes todo prompts to all agents', async () => {
    const out = JSON.parse(await new MockLLMProvider().complete([{ role: 'user', content: 'Build a TODO app' }]));
    expect(out.routes).toEqual(['code', 'db', 'design']);
  });
});
