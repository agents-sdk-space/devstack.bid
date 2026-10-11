import { useContext, useSyncExternalStore } from 'react';
import type { DevstackRuntime, DevstackState } from '@/runtime/DevstackRuntime';
import { RuntimeContext } from './runtimeContext';

export function useRuntime(): DevstackRuntime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error('useRuntime must be used inside <DevstackProvider>');
  return rt;
}

/** Subscribe to a slice of runtime state. */
export function useDevstack<T>(selector: (s: DevstackState) => T): T {
  const rt = useRuntime();
  return useSyncExternalStore(rt.store.subscribe, () => selector(rt.store.getState()));
}
