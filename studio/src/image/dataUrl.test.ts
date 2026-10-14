import { describe, expect, it } from 'vitest';
import { assetFilename, bytesToDataUrl, dataUrlToBytes } from './dataUrl';

describe('image data helpers', () => {
  it('round-trips bytes through data URLs', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
    expect(dataUrlToBytes(bytesToDataUrl(bytes))).toEqual(bytes);
  });

  it('sanitizes asset filenames', () => {
    expect(assetFilename('Todo Hero!.JPG')).toBe('todo-hero.png');
    expect(assetFilename('../../etc/passwd')).toBe('etc-passwd.png');
    expect(assetFilename('***')).toBe('asset.png');
  });
});
