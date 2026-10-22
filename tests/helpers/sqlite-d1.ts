// Real SQLite (node:sqlite) with every migration applied, wrapped as D1Like. Test helper only.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Like } from "@/lib/chat/store";

export function sqliteD1(): D1Like & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) raw.exec(readFileSync(join(dir, f), "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => {
    const conv = sql.replace(/\?(\d+)/g, "?");
    const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]) - 1);
    const vals = () => (order.length ? order.map((i) => args[i]) : args) as never[];
    return {
      bind: (...a: unknown[]) => stmt(sql, a),
      async all() { const s = raw.prepare(conv); return /^\s*(SELECT|WITH)/i.test(sql) || /RETURNING/i.test(sql) ? { results: s.all(...vals()) } : (s.run(...vals()), { results: [] }); },
      async run() { return this.all(); },
      async first() { return ((await this.all()).results?.[0] ?? null) as never; },
    };
  };
  return {
    raw,
    prepare: (s: string) => stmt(s) as never,
    batch: async (list: unknown[]) => {
      raw.exec("BEGIN");
      try { const out = []; for (const s of list as { all(): Promise<unknown> }[]) out.push(await s.all()); raw.exec("COMMIT"); return out as never; }
      catch (e) { raw.exec("ROLLBACK"); throw e; }
    },
  };
}

