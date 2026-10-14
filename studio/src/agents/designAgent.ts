import type { EventBroker } from '@/broker/eventBroker';
import type { GeneratedImage, ImageGenerator } from '@/image/types';
import type { SandboxFs } from '@/sandbox/types';

export async function runDesignAgent(
  broker: EventBroker,
  fs: SandboxFs,
  generate: ImageGenerator,
  input: { prompt: string; filename: string },
): Promise<GeneratedImage> {
  await broker.emit('agent:thinking', { active: true, agent: 'design' });
  await broker.emit('design:image-requested', input);
  const img = await generate(input.prompt, input.filename);
  await fs.writeFile(img.path, img.bytes);
  await broker.emit('design:image-ready', { path: img.path, dataUrl: img.dataUrl, source: img.source });
  return img;
}
