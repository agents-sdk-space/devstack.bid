import { API_PATHS } from '@/shared/apiPaths';
import type { HealthResponseBody, ImageResponseBody } from '@/shared/apiTypes';
import { compressImage } from './compress';
import { assetFilename, bytesToDataUrl, dataUrlToBytes } from './dataUrl';
import { mockPlaceholderDataUrl } from './mockImageProvider';
import type { GeneratedImage, ImageGenerator } from './types';

async function proxyGenerate(prompt: string): Promise<string> {
  const res = await fetch(API_PATHS.image, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: string }).error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`Image proxy failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return ((await res.json()) as ImageResponseBody).dataUrl;
}

/** Build the browser image pipeline: provider (proxy or mock) -> worker compression -> /public/assets. */
export function createImageGenerator(health: HealthResponseBody | null): ImageGenerator {
  return async (prompt, filename): Promise<GeneratedImage> => {
    let raw: string;
    let source: GeneratedImage['source'] = 'mock';
    let fallbackReason: string | undefined;
    if (health?.image) {
      try {
        raw = await proxyGenerate(prompt);
        source = 'proxy';
      } catch (err) {
        fallbackReason = err instanceof Error ? err.message : String(err);
        raw = mockPlaceholderDataUrl(prompt);
      }
    } else {
      raw = mockPlaceholderDataUrl(prompt);
    }
    const bytes = await compressImage(dataUrlToBytes(raw));
    return {
      path: `public/assets/${assetFilename(filename)}`,
      dataUrl: bytesToDataUrl(bytes),
      bytes,
      source,
      fallbackReason,
    };
  };
}
