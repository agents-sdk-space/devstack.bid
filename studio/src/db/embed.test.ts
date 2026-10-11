import { describe, expect, it } from 'vitest';
import { EMBED_DIM, chunkMarkdown, cosineDistance, embedText, toPgVector, tokenize } from './embed';

describe('local embeddings', () => {
  it('are deterministic, unit-length and the right size', () => {
    const a = embedText('Build a todo app');
    expect(a).toHaveLength(EMBED_DIM);
    expect(embedText('Build a todo app')).toEqual(a);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 4);
    expect(embedText('')).toHaveLength(EMBED_DIM);
  });

  it('rank related text closer than unrelated text', () => {
    const q = embedText('todo list tasks');
    const near = embedText('a list of todo tasks to finish');
    const far = embedText('stripe billing invoices');
    expect(cosineDistance(q, near)).toBeLessThan(cosineDistance(q, far));
  });

  it('tokenizes and formats pgvector literals', () => {
    expect(tokenize('Hello, World! a')).toEqual(['hello', 'world']);
    expect(toPgVector([0.5, -1])).toBe('[0.5,-1]');
  });

  it('chunks markdown by headings/paragraphs within the limit', () => {
    const md = `# A\n\n${'x'.repeat(50)}\n\n## B\n\n${'y'.repeat(1300)}`;
    const chunks = chunkMarkdown(md, 600);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.length <= 600)).toBe(true);
  });
});
