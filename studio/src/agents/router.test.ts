import { describe, expect, it } from 'vitest';
import { mergeVaultIntoSystem, parseRoutePlan } from './router';

describe('agent router', () => {
  it('parses JSON route plans', () => {
    const plan = parseRoutePlan(JSON.stringify({ routes: ['code', 'db'], summary: 'Build data layer' }), 'fallback');
    expect(plan.targets).toEqual(['code', 'db']);
    expect(plan.summary).toBe('Build data layer');
  });

  it('extracts JSON from fenced/prose output, dedupes and drops unknown targets', () => {
    const plan = parseRoutePlan(
      'Sure!\n```json\n{"routes":["Code","code","design","orchestrator","x"],"summary":"s","assetName":"Hero"}\n```',
      'fb',
    );
    expect(plan.targets).toEqual(['code', 'design']);
    expect(plan.assetName).toBe('Hero');
  });

  it('falls back when JSON is invalid', () => {
    const plan = parseRoutePlan('not json', 'fallback');
    expect(plan.targets).toEqual(['code']);
    expect(plan.reason).toBe('fallback');
  });

  it('merges markdown vault into system prompt within a budget', () => {
    const merged = mergeVaultIntoSystem('base', ['# Rules\nUse TypeScript']);
    expect(merged).toContain('Imported knowledge vault');
    expect(merged).toContain('Use TypeScript');
    expect(mergeVaultIntoSystem('b', ['x'.repeat(50_000)], 1000).length).toBeLessThan(1200);
    expect(mergeVaultIntoSystem('b', [])).toBe('b');
  });
});
