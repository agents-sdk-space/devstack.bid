import { describe, expect, it, vi } from 'vitest';
import { EventBroker } from './eventBroker';

describe('EventBroker', () => {
  it('delivers payloads to subscribers', async () => {
    const broker = new EventBroker();
    const fn = vi.fn();
    broker.on('agent:message', fn);
    await broker.emit('agent:message', { role: 'user', content: 'hello' });
    expect(fn).toHaveBeenCalledWith({ role: 'user', content: 'hello' });
  });

  it('unsubscribes cleanly', async () => {
    const broker = new EventBroker();
    const fn = vi.fn();
    const off = broker.on('agent:thinking', fn);
    off();
    await broker.emit('agent:thinking', { active: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates failing subscribers', async () => {
    const broker = new EventBroker();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = vi.fn();
    broker.on('db:data-changed', () => {
      throw new Error('boom');
    });
    broker.on('db:data-changed', ok);
    await broker.emit('db:data-changed', {});
    expect(ok).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('caps history', async () => {
    const broker = new EventBroker(3);
    for (let i = 0; i < 5; i++) await broker.emit('db:data-changed', {});
    expect(broker.getHistory(10)).toHaveLength(3);
  });

  it('records history', async () => {
    const broker = new EventBroker();
    await broker.emit('export:started', {});
    expect(broker.getHistory(1)[0]?.name).toBe('export:started');
  });
});
