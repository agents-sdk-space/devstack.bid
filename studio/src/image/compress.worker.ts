/// <reference lib="webworker" />
// Background compression pipeline: decode -> downscale -> re-encode PNG off the main thread.
interface Job {
  id: number;
  bytes: ArrayBuffer;
  maxWidth: number;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, bytes, maxWidth } = e.data;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D unsupported');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const out = await blob.arrayBuffer();
    (self as unknown as Worker).postMessage({ id, bytes: out, width: w, height: h }, [out]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
