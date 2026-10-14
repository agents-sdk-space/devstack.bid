export interface GeneratedImage {
  /** Sandbox path, e.g. public/assets/hero.png */
  path: string;
  dataUrl: string;
  bytes: Uint8Array;
  source: 'proxy' | 'mock';
  /** Set when the real provider failed and the mock was used instead. */
  fallbackReason?: string;
}

export type ImageGenerator = (prompt: string, filename: string) => Promise<GeneratedImage>;
