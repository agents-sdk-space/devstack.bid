import type { DevstackEventMap, DevstackEventName, EventHandler } from './events';

type HandlerEntry = { handler: EventHandler<DevstackEventName>; id: number };
type HistoryEntry = { name: DevstackEventName; payload: unknown; at: number };

/** Central typed async event broker connecting agents, sandbox, DB and UI. */
export class EventBroker {
  private listeners = new Map<DevstackEventName, HandlerEntry[]>();
  private nextId = 1;
  private history: HistoryEntry[] = [];

  constructor(private maxHistory = 500) {}

  on<T extends DevstackEventName>(name: T, handler: EventHandler<T>): () => void {
    const entry: HandlerEntry = { id: this.nextId++, handler: handler as EventHandler<DevstackEventName> };
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), entry]);
    return () => {
      this.listeners.set(
        name,
        (this.listeners.get(name) ?? []).filter((e) => e.id !== entry.id),
      );
    };
  }

  /** Delivers to every subscriber; a failing subscriber does not block the others. */
  async emit<T extends DevstackEventName>(name: T, payload: DevstackEventMap[T]): Promise<void> {
    this.history.push({ name, payload, at: Date.now() });
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);
    for (const { handler } of this.listeners.get(name) ?? []) {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[broker] handler for ${name} failed`, err);
      }
    }
  }

  getHistory(limit = 50): HistoryEntry[] {
    return this.history.slice(-limit);
  }
}
