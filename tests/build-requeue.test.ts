import { describe, expect, it } from "vitest";
import { MAX_REQUEUES, REQUEUE_BASE_MS, requeueOrphans } from "@/lib/build/sweep";

function mockDb(rows: { id: string; requeues: number }[]) {
  const log: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        log.push({ sql, args });
        return {
          all: async () => ({ results: sql.startsWith("UPDATE build_jobs SET next_attempt_at") ? rows : [] }),
          first: async () => (sql.includes("RETURNING *") ? null : { seq: 1 }),
          run: async () => ({}),
        };
      },
    }),
  } as never;
  return { db, log };
}

describe("requeueOrphans", () => {
  it("claims atomically with backoff (UPDATE … RETURNING) and re-sends below the cap", async () => {
    const { db, log } = mockDb([{ id: "j1", requeues: 0 }, { id: "j2", requeues: 2 }]);
    const sent: unknown[] = [];
    const n = await requeueOrphans(db, async (b) => sent.push(b), 1_000_000_000, 60_000);
    expect(n).toBe(2);
    expect(sent).toEqual([{ jobId: "j1" }, { jobId: "j2" }]);
    const upd = log[0];
    expect(upd.sql).toMatch(/^UPDATE build_jobs SET next_attempt_at = .*RETURNING id/);
    expect(upd.args).toEqual([1_000_000_000, 1_000_000_000 - 60_000, 1_000_000_000 - 24 * 3600_000, REQUEUE_BASE_MS]);
    expect(log.filter((l) => l.sql.startsWith("INSERT INTO build_events")).map((l) => l.args[2])).toEqual(["requeued", "requeued"]);
  });
  it(`fails the job with a clear message after ${MAX_REQUEUES} re-deliveries`, async () => {
    const { db, log } = mockDb([{ id: "j9", requeues: MAX_REQUEUES }]);
    const sent: unknown[] = [];
    expect(await requeueOrphans(db, async (b) => sent.push(b), 1_000_000_000)).toBe(0);
    expect(sent).toEqual([]);
    const ev = log.find((l) => l.sql.startsWith("INSERT INTO build_events"))!;
    expect(String(ev.args[3])).toMatch(/never started/);
    expect(log.some((l) => l.sql.includes("UPDATE build_jobs SET status") && l.args.includes("queue_lost"))).toBe(true);
  });
});
