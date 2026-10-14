/** Branded placeholder used when no image model is configured (browser only). */
export function mockPlaceholderDataUrl(prompt: string, width = 768, height = 480): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  const grd = ctx.createLinearGradient(0, 0, width, height);
  grd.addColorStop(0, 'rgba(41,151,255,0.35)');
  grd.addColorStop(1, 'rgba(30,41,59,0.9)');
  ctx.fillStyle = grd;
  ctx.fillRect(24, 24, width - 48, height - 48);
  ctx.strokeStyle = '#2997FF';
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, width - 49, height - 49);
  ctx.fillStyle = '#2997FF';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText('DEVSTACK placeholder image', 48, 72);
  ctx.fillStyle = '#98989D';
  ctx.font = '13px Inter, sans-serif';
  const label = prompt.slice(0, 70) + (prompt.length > 70 ? '…' : '');
  ctx.fillText(label, 48, 102);
  return canvas.toDataURL('image/png');
}
