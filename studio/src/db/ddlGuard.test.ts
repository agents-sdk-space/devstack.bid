import { describe, expect, it } from 'vitest';
import { guardDdl, splitSqlStatements } from './ddlGuard';

describe('splitSqlStatements', () => {
  it('respects quotes, dollar quotes and comments', () => {
    const s = splitSqlStatements(`
      -- comment; with semicolon
      INSERT INTO t (a) VALUES ('x;y''z');
      /* block ; */ CREATE TABLE IF NOT EXISTS "we;ird" (id int);
      SELECT $$a;b$$;
    `);
    expect(s).toEqual([
      "INSERT INTO t (a) VALUES ('x;y''z')",
      'CREATE TABLE IF NOT EXISTS "we;ird" (id int)',
      'SELECT $$a;b$$',
    ]);
  });
});

describe('guardDdl', () => {
  it('allows additive schema changes and seed inserts', () => {
    const g = guardDdl(`
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION);
      CREATE INDEX IF NOT EXISTS posts_user_idx ON posts (user_id);
      ALTER TABLE posts ADD COLUMN title TEXT;
      INSERT INTO users (email) SELECT 'a@b.c' WHERE NOT EXISTS (SELECT 1 FROM users);
      INSERT INTO users (email) VALUES ('drop table x') ON CONFLICT DO NOTHING;
    `);
    expect(g.errors).toEqual([]);
    expect(g.ok).toBe(true);
    expect(g.statements).toHaveLength(6);
  });

  it.each([
    'DROP TABLE users',
    'DELETE FROM users',
    'UPDATE users SET email = 1',
    'TRUNCATE users',
    'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql',
    'CREATE TABLE IF NOT EXISTS embeddings (id int)',
    'ALTER TABLE users DROP COLUMN email',
    'GRANT ALL ON users TO public',
    "CREATE TABLE IF NOT EXISTS t (id int); COPY t FROM '/etc/passwd'",
    '',
  ])('rejects %j', (sql) => {
    expect(guardDdl(sql).ok).toBe(false);
  });
});
