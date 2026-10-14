let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; bytes?: ArrayBuffer; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.bytes) p.resolve(new Uint8Array(e.data.bytes));
      else p.reject(new Error(e.data.error ?? 'compression failed'));
    };
  }
  return worker;
}

async function compressOnMainThread(bytes: Uint8Array, maxWidth: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Canvas encode failed');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Downscale + re-encode an image in a Web Worker (falls back to the main thread). */
export async function compressImage(bytes: Uint8Array, maxWidth = 768): Promise<Uint8Array> {
  const w = getWorker();
  if (!w) return compressOnMainThread(bytes, maxWidth);
  const id = nextId++;
  const copy = bytes.slice().buffer;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, bytes: copy, maxWidth }, [copy]);
  }).catch(() => compressOnMainThread(bytes, maxWidth));
}
