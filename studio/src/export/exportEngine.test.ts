import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TODO_SCHEMA } from '@/agents/dbAgent';
import { DevstackDb } from '@/db/pgliteClient';
import { MemoryFs } from '@/sandbox/memoryFs';
import { getInitialSandboxFiles, TODO_APP_FILES } from '@/sandbox/template';
import { PNG_BYTES } from '@/test/fakes';
import { buildExportBundle } from './exportEngine';

describe('buildExportBundle', () => {
  const db = new DevstackDb();
  beforeAll(async () => {
    await db.init();
    await db.applyGuardedDdl(TODO_SCHEMA);
  });
  afterAll(() => db.close());

  async function bundle(extra: Record<string, string | Uint8Array> = {}) {
    const fs = new MemoryFs({
      ...getInitialSandboxFiles(),
      ...TODO_APP_FILES,
      'package-lock.json': '{"lockfileVersion":3}',
      'public/assets/todo-hero.png': PNG_BYTES,
      'node_modules/react/index.js': 'nope',
      '.env': 'SECRET=1',
      ...extra,
    });
    const res = await buildExportBundle(fs, db);
    const zip = await JSZip.loadAsync(await res.blob.arrayBuffer());
    return { res, zip };
  }

  it('contains source, lockfile, env example, deploy configs, SQL and Prisma', async () => {
    const { res, zip } = await bundle();
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    for (const required of [
      'package.json',
      'package-lock.json',
      'index.html',
      'vite.config.js',
      'src/App.jsx',
      'src/main.jsx',
      'src/devstackDb.js',
      'public/assets/todo-hero.png',
      '.env.example',
      '.gitignore',
      'README.md',
      'vercel.json',
      'wrangler.toml',
      'public/_redirects',
      'Dockerfile',
      'nginx.conf',
      '.dockerignore',
      'db/migrations/001_init.sql',
      'db/schema.prisma',
    ]) {
      expect(names, required).toContain(required);
    }
    expect(res.files.sort()).toEqual(names.sort());
    expect(res.bytes).toBe(res.blob.size);
  });

  it('excludes node_modules and real .env files', async () => {
    const { zip } = await bundle();
    expect(Object.keys(zip.files).some((n) => n.includes('node_modules'))).toBe(false);
    expect(zip.file('.env')).toBeNull();
  });

  it('keeps binary assets byte-exact and text content intact', async () => {
    const { zip } = await bundle();
    expect(new Uint8Array(await zip.file('public/assets/todo-hero.png')!.async('uint8array'))).toEqual(PNG_BYTES);
    expect(await zip.file('src/App.jsx')!.async('string')).toBe(TODO_APP_FILES['src/App.jsx']);
  });

  it('includes a real migration and prisma model for the app tables', async () => {
    const { zip } = await bundle();
    const sql = await zip.file('db/migrations/001_init.sql')!.async('string');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "todos"');
    expect(sql).toContain(`INSERT INTO "todos"`);
    const prisma = await zip.file('db/schema.prisma')!.async('string');
    expect(prisma).toContain('model Todos {');
    const vercel = JSON.parse(await zip.file('vercel.json')!.async('string'));
    expect(vercel.outputDirectory).toBe('dist');
    expect(await zip.file('Dockerfile')!.async('string')).toContain('npm ci');
    expect(await zip.file('wrangler.toml')!.async('string')).toContain('pages_build_output_dir = "dist"');
    expect(await zip.file('README.md')!.async('string')).toContain('npm ci');
  });

  it('does not overwrite project-provided deploy files', async () => {
    const { zip } = await bundle({ 'vercel.json': '{"custom":true}' });
    expect(await zip.file('vercel.json')!.async('string')).toBe('{"custom":true}');
  });
});
