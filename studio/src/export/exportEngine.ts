import JSZip from 'jszip';
import type { SandboxFs } from '@/sandbox/types';
import { isBinaryPath } from '@/sandbox/paths';
import {
  EXPORT_CF_REDIRECTS,
  EXPORT_DOCKERFILE,
  EXPORT_DOCKERIGNORE,
  EXPORT_ENV_EXAMPLE,
  EXPORT_GITIGNORE,
  EXPORT_NGINX_CONF,
  EXPORT_VERCEL_JSON,
  EXPORT_WRANGLER_TOML,
  exportReadme,
} from './deployTemplates';

export interface ExportDb {
  exportSql(): Promise<string>;
  exportPrismaSchema(): Promise<string>;
  listTables(): Promise<string[]>;
}

export interface ExportResult {
  blob: Blob;
  files: string[];
  bytes: number;
}

/** Files we add only when the project does not define its own version. */
function generatedFiles(hasLockfile: boolean, tables: string[]): Record<string, string> {
  return {
    '.env.example': EXPORT_ENV_EXAMPLE,
    '.gitignore': EXPORT_GITIGNORE,
    'README.md': exportReadme({ hasLockfile, tables }),
    'vercel.json': EXPORT_VERCEL_JSON,
    'wrangler.toml': EXPORT_WRANGLER_TOML,
    'public/_redirects': EXPORT_CF_REDIRECTS,
    Dockerfile: EXPORT_DOCKERFILE,
    'nginx.conf': EXPORT_NGINX_CONF,
    '.dockerignore': EXPORT_DOCKERIGNORE,
  };
}

/** Bundle source + lockfile + env example, deploy payloads, and SQL/Prisma migration blueprint. */
export async function buildExportBundle(fs: SandboxFs, db: ExportDb): Promise<ExportResult> {
  const zip = new JSZip();
  const files: string[] = [];
  const projectFiles = (await fs.listFiles()).filter(
    (p) => !p.split('/').includes('node_modules') && !/^\.env($|\.)(?!example)/.test(p),
  );
  for (const path of projectFiles) {
    if (isBinaryPath(path)) zip.file(path, await fs.readBinary(path));
    else zip.file(path, await fs.readFile(path));
    files.push(path);
  }

  const tables = (await db.listTables()).filter((t) => t !== 'embeddings');
  const hasLockfile = projectFiles.includes('package-lock.json');
  for (const [path, content] of Object.entries(generatedFiles(hasLockfile, tables))) {
    if (projectFiles.includes(path)) continue;
    zip.file(path, content);
    files.push(path);
  }

  zip.file('db/migrations/001_init.sql', await db.exportSql());
  zip.file('db/schema.prisma', await db.exportPrismaSchema());
  files.push('db/migrations/001_init.sql', 'db/schema.prisma');

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, files: files.sort(), bytes: blob.size };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
