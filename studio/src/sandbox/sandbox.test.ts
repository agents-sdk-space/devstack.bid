import { describe, expect, it, vi } from 'vitest';
import { isMutation, validateBridgeSql } from './dbBridge';
import { MemoryFs } from './memoryFs';
import { isBinaryPath, normalizeProjectPath } from './paths';
import { ProjectFs } from './projectFs';
import { scaffoldFiles } from './template';
import { toFileSystemTree } from './webcontainer';

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

describe('toFileSystemTree', () => {
  it('builds nested WebContainer trees', () => {
    const tree = toFileSystemTree({ 'package.json': '{}', 'src/App.jsx': 'x', 'src/lib/u.js': 'y', 'public/a.png': new Uint8Array([1]) });
    expect(tree).toEqual({
      'package.json': { file: { contents: '{}' } },
      src: { directory: { 'App.jsx': { file: { contents: 'x' } }, lib: { directory: { 'u.js': { file: { contents: 'y' } } } } } },
      public: { directory: { 'a.png': { file: { contents: new Uint8Array([1]) } } } },
    });
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
