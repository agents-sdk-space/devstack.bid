import type { AgentKind } from '@/broker/events';
import { extractJsonObject } from '@/llm/json';
import type { RoutePlan } from './types';

const VALID: AgentKind[] = ['code', 'design', 'db'];

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function parseRoutePlan(raw: string, fallbackReason: string): RoutePlan {
  try {
    const parsed = extractJsonObject(raw) as Record<string, unknown>;
    const rawTargets = Array.isArray(parsed.routes)
      ? parsed.routes
      : Array.isArray(parsed.targets)
        ? parsed.targets
        : ['code'];
    const targets = [...new Set(rawTargets.map((t) => String(t).toLowerCase()))].filter(
      (t): t is AgentKind => VALID.includes(t as AgentKind),
    );
    const summary = str(parsed.summary) ?? str(parsed.reason) ?? fallbackReason;
    return {
      targets: targets.length ? targets : ['code'],
      reason: str(parsed.reason) ?? summary,
      summary,
      codeIntent: str(parsed.codeIntent),
      dbIntent: str(parsed.dbIntent),
      designIntent: str(parsed.designIntent),
      assetName: str(parsed.assetName),
    };
  } catch {
    return { targets: ['code'], reason: fallbackReason, summary: fallbackReason, codeIntent: 'generic' };
  }
}

export function mergeVaultIntoSystem(base: string, vault: string[], maxChars = 12_000): string {
  if (!vault.length) return base;
  let budget = maxChars;
  const docs: string[] = [];
  vault.forEach((doc, i) => {
    if (budget <= 0) return;
    const d = doc.slice(0, budget);
    budget -= d.length;
    docs.push(`### Vault document ${i + 1}\n${d}`);
  });
  return `${base}\n\n## Imported knowledge vault\n${docs.join('\n\n')}`;
}
