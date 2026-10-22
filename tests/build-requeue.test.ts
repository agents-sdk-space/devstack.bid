import { describe, expect, it } from "vitest";
import { requeueOrphans } from "@/lib/build/sweep";

describe("requeueOrphans", () => {
  it("re-sends only stale unclaimed queued jobs and passes the time window", async () => {
    let bound: unknown[] = [];
    const db = { prepare: (sql: string) => ({ bind: (...a: unknown[]) => { bound = a; return { all: async () => ({ results: sql.includes("status = 'queued'") ? [{ id: "j1" }, { id: "j2" }] : [] }) }; } }) } as never;
    const sent: unknown[] = [];
    const n = await requeueOrphans(db, async (b) => sent.push(b), 1_000_000_000, 60_000);
    expect(n).toBe(2);
    expect(sent).toEqual([{ jobId: "j1" }, { jobId: "j2" }]);
    expect(bound).toEqual([1_000_000_000 - 60_000, 1_000_000_000 - 24 * 3600_000]);
  });
});
