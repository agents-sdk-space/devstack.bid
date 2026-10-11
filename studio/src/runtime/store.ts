export type Listener = () => void;

/** Minimal external store for useSyncExternalStore. */
export class Store<S extends object> {
  private listeners = new Set<Listener>();

  constructor(private state: S) {}

  getState = (): S => this.state;

  setState = (patch: Partial<S> | ((s: S) => Partial<S>)): void => {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  };

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}
