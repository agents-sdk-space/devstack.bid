import { describe, expect, it, vi } from 'vitest';
import { isMutation, validateBridgeSql } from './dbBridge';
import { MemoryFs } from './memoryFs';
import { isBinaryPath, normalizeProjectPath } from './paths';
import { ProjectFs } from './projectFs';
import { getInitialSandboxFiles, scaffoldFiles, TODO_APP_FILES } from './template';
import { affectsPreview, buildPreviewBundle, inlinePublicUrls, toDataUrl } from './staticBundler';

describe('paths', () => {
  it('normalizes and rejects traversal', () => {
    expect(normalizeProjectPath('./src//App.jsx')).toBe('src/App.jsx');
    expect(normalizeProjectPath('/public\\assets\\a.png')).toBe('public/assets/a.png');
    expect(() => normalizeProjectPath('src/../../etc')).toThrow(/traversal/);
    expect(() => normalizeProjectPath('')).toThrow(/Empty/);
    expect(isBinaryPath('public/assets/x.PNG')).toBe(true);
    expect(isBinaryPath('src/App.jsx')).toBe(false);
  });
});

describe('MemoryFs / ProjectFs', () => {
  it('stores text and binary content', async () => {
    const fs = new MemoryFs({ 'a.txt': 'hi' });
    await fs.writeFile('b.bin', new Uint8Array([1, 2]));
    expect(await fs.readFile('a.txt')).toBe('hi');
    expect(await fs.readBinary('a.txt')).toEqual(new TextEncoder().encode('hi'));
    expect(await fs.readBinary('b.bin')).toEqual(new Uint8Array([1, 2]));
    expect(await fs.listFiles()).toEqual(['a.txt', 'b.bin']);
    expect(fs.textSnapshot()).toEqual({ 'a.txt': 'hi' });
    await expect(fs.readFile('missing')).rejects.toThrow(/ENOENT/);
  });

  it('writes through to the mirror once attached and notifies listeners', async () => {
    const pfs = new ProjectFs({ 'a.txt': 'one' });
    const mirror = new MemoryFs();
    const changes: string[] = [];
    pfs.onChange((p) => changes.push(p));
    await pfs.writeFile('before.txt', 'x');
    expect(await mirror.listFiles()).toEqual([]);
    await pfs.attachMirror(mirror);
    expect(await mirror.listFiles()).toEqual(['a.txt', 'before.txt']);
    await pfs.writeFile('after.txt', 'y');
    expect(await mirror.readFile('after.txt')).toBe('y');
    await pfs.writeFromMirror('package-lock.json', '{}');
    expect(await mirror.listFiles()).not.toContain('package-lock.json');
    expect(await pfs.readFile('package-lock.json')).toBe('{}');
    expect(changes).toEqual(['before.txt', 'after.txt', 'package-lock.json']);
  });
});

/** Minimal CommonJS loader equivalent to the one in public/preview/index.html (for tests). */
function runBundle(bundle: NonNullable<ReturnType<typeof buildPreviewBundle>['bundle']>, vendor: Record<string, unknown>) {
  const cache: Record<string, { exports: Record<string, unknown> }> = {};
  const load = (from: string, spec: string): unknown => {
    if (spec in vendor) return vendor[spec];
    const dir = from.split('/').slice(0, -1);
    const parts = [...dir, ...spec.split('/')].filter((x) => x && x !== '.');
    const p = parts.join('/');
    const id = ['', '.jsx', '.js'].map((e) => p + e).find((c) => c in bundle.modules || c in bundle.css);
    if (!id) throw new Error(`Cannot resolve ${spec}`);
    if (id in bundle.css) return {};
    if (cache[id]) return cache[id].exports;
    const module = { exports: {} as Record<string, unknown> };
    cache[id] = module;
    new Function('require', 'module', 'exports', bundle.modules[id] as string)((s: string) => load(id, s), module, module.exports);
    return module.exports;
  };
  return load;
}

describe('static preview bundler (Sucrase)', () => {
  const hero = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const files = { ...getInitialSandboxFiles(), ...TODO_APP_FILES, 'public/assets/todo-hero.png': hero };

  it('compiles the todo app into CommonJS modules with the entry from index.html', () => {
    const res = buildPreviewBundle(files);
    expect(res.errors).toEqual([]);
    const b = res.bundle!;
    expect(b.entry).toBe('src/main.jsx');
    expect(Object.keys(b.modules).sort()).toEqual(['src/App.jsx', 'src/devstackDb.js', 'src/main.jsx']);
    expect(b.css['src/index.css']).toContain('color-scheme: dark');
    expect(b.modules['src/App.jsx']).toContain('require("react/jsx-runtime")');
    expect(b.modules['src/App.jsx']).not.toMatch(/<main|vite\.config/);
    // public URL rewritten to an inline data URL (the preview has no network).
    expect(b.modules['src/App.jsx']).toContain('data:image/png;base64,iVBORw==');
    expect(b.assets['/assets/todo-hero.png']).toBe('data:image/png;base64,iVBORw==');
    expect(b.title).toBe('DEVSTACK App');
  });

  it('runs the compiled modules with only react + react-dom provided', () => {
    const { bundle } = buildPreviewBundle(files);
    const rendered: unknown[] = [];
    const jsx = (type: unknown, props: unknown) => ({ type, props });
    const vendor = {
      react: { StrictMode: 'StrictMode', useState: (v: unknown) => [v, () => undefined], useEffect: () => undefined },
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'react-dom/client': { createRoot: () => ({ render: (el: unknown) => rendered.push(el) }) },
    };
    const g = globalThis as unknown as { document?: unknown };
    const prev = g.document;
    g.document = { getElementById: () => ({}) };
    try {
      runBundle(bundle!, vendor)('', './src/main.jsx');
    } finally {
      g.document = prev;
    }
    expect(rendered).toHaveLength(1);
  });

  it('reports syntax errors with the file path instead of a bundle', () => {
    const res = buildPreviewBundle({ ...files, 'src/App.jsx': 'export default function App() { return <div> }' });
    expect(res.bundle).toBeNull();
    expect(res.errors[0]).toMatch(/^src\/App\.jsx: /);
  });

  it('compiles TypeScript, JSON and skips config/tests', () => {
    const res = buildPreviewBundle({
      ...files,
      'src/util.ts': 'export const n: number = 1;',
      'src/data.json': '{"a":1}',
      'src/App.test.jsx': 'boom(',
    });
    expect(res.errors).toEqual([]);
    expect(res.bundle!.modules['src/util.ts']).toContain('exports.n = n');
    expect(res.bundle!.modules['src/data.json']).toBe('module.exports = {"a":1};');
    expect(res.bundle!.modules).not.toHaveProperty('src/App.test.jsx');
    expect(res.bundle!.modules).not.toHaveProperty('vite.config.js');
  });

  it('inlines public URLs in JS strings and CSS url()', () => {
    const map = { '/a.svg': 'data:x' };
    expect(inlinePublicUrls(`img("/a.svg"); url(/a.svg) "/a.svgz"`, map)).toBe(`img("data:x"); url("data:x") "/a.svgz"`);
    expect(toDataUrl('x.svg', '<svg/>')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(toDataUrl('x.txt', 'hi')).toBeNull();
    expect(affectsPreview('src/App.jsx')).toBe(true);
    expect(affectsPreview('package.json')).toBe(false);
    expect(affectsPreview('vite.config.js')).toBe(false);
  });

  it('scaffold always contains the DB bridge and entry points', () => {
    expect(Object.keys(scaffoldFiles()).sort()).toEqual(
      ['index.html', 'package.json', 'src/devstackDb.js', 'src/index.css', 'src/main.jsx', 'vite.config.js'].sort(),
    );
    expect(JSON.parse(scaffoldFiles()['package.json'] as string).scripts.dev).toContain('vite');
  });
});

describe('sandbox DB bridge validation', () => {
  const req = (sql: string) => ({ type: 'devstack:sql', id: 1, sql, params: [1] });

  it.each([
    'SELECT * FROM todos',
    'INSERT INTO todos (title) VALUES ($1) RETURNING *',
    'UPDATE todos SET done = true WHERE id = $1;',
    'DELETE FROM todos WHERE id = $1',
    'CREATE TABLE IF NOT EXISTS prefs (id SERIAL PRIMARY KEY)',
    'WITH x AS (SELECT 1) SELECT * FROM x',
  ])('allows %s', (sql) => {
    expect(validateBridgeSql(req(sql))).toMatchObject({ id: 1 });
  });

  it.each([
    'DROP TABLE todos',
    'SELECT 1; DROP TABLE todos',
    'DELETE FROM embeddings',
    'ALTER TABLE todos DROP COLUMN title',
    'COPY todos TO stdout',
    'TRUNCATE todos',
  ])('rejects %s', (sql) => {
    expect(typeof validateBridgeSql(req(sql))).toBe('string');
  });

  it('rejects malformed messages and classifies mutations', () => {
    expect(validateBridgeSql({ type: 'other' })).toBe('invalid message');
    expect(validateBridgeSql(null)).toBe('invalid message');
    expect(isMutation('SELECT 1')).toBe(false);
    expect(isMutation('INSERT INTO t VALUES (1)')).toBe(true);
    expect(isMutation('WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x')).toBe(true);
    void vi;
  });
});
