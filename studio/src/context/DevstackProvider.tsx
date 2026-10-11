import { useEffect, useState, type ReactNode } from 'react';
import { DevstackRuntime } from '@/runtime/DevstackRuntime';
import { RuntimeContext } from './runtimeContext';

export function DevstackProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return new DevstackRuntime({ enableSandbox: params.get('sandbox') !== 'off' });
  });
  useEffect(() => {
    runtime.start();
  }, [runtime]);
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}
