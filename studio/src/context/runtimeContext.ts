import { createContext } from 'react';
import type { DevstackRuntime } from '@/runtime/DevstackRuntime';

export const RuntimeContext = createContext<DevstackRuntime | null>(null);
