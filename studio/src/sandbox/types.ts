export type FileContent = string | Uint8Array;

export interface SandboxFs {
  writeFile(path: string, content: FileContent): Promise<void>;
  readFile(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  listFiles(): Promise<string[]>;
}

export type SandboxPhase = 'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'error';

export interface SandboxStatus {
  phase: SandboxPhase;
  message?: string;
}
