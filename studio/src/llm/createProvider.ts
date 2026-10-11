import { API_PATHS } from '@/shared/apiPaths';
import type { HealthResponseBody } from '@/shared/apiTypes';
import { MockLLMProvider } from './mockProvider';
import { ProxyLLMProvider } from './proxyProvider';
import type { LLMProvider } from './types';

export interface BackendStatus {
  health: HealthResponseBody | null;
  llm: LLMProvider;
}

/** Ask the server which capabilities are configured; fall back to the mock provider. */
export async function resolveBackend(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<BackendStatus> {
  try {
    const res = await fetchImpl(API_PATHS.health, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const health = (await res.json()) as HealthResponseBody;
    if (health.llm) {
      return {
        health,
        llm: new ProxyLLMProvider(`${health.provider ?? 'proxy'} · ${health.model ?? ''}`.trim()),
      };
    }
    return { health, llm: new MockLLMProvider() };
  } catch {
    return { health: null, llm: new MockLLMProvider() };
  }
}
