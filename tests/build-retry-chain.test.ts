import { describe, expect, it } from "vitest";
import { sqliteD1 } from "./helpers/sqlite-d1";

// Regression (2026-10-22 e2e): attempt 3 failed "Project or deployment no longer exists" because the deployment row
// had been re-linked to attempt 2 while the lookup only checked the original job id.
describe("retry chain deployment lookup", () => {
  it("finds the deployment linked to any job in the chain", async () => {
    const db = sqliteD1();
    db.raw.exec(`INSERT INTO users (id) VALUES ('u'); INSERT INTO projects (id, user_id, name) VALUES ('p', 'u', 'x');
      INSERT INTO build_jobs (id, project_id, user_id, status, executor) VALUES ('j1','p','u','failed','cf-container');
      INSERT INTO build_jobs (id, project_id, user_id, status, executor, retry_of, attempt) VALUES ('j2','p','u','failed','cf-container','j1',2);
      INSERT INTO build_jobs (id, project_id, user_id, status, executor, retry_of, attempt) VALUES ('j3','p','u','queued','cf-container','j1',3);
      INSERT INTO deployments (id, project_id, user_id, target, status, build_job_id) VALUES ('d','p','u','devstack-sites','failed','j2');`);
    const sql = (await import("node:fs")).readFileSync("src/lib/build/executor.ts", "utf8").match(/"(SELECT id FROM deployments WHERE build_job_id IN \(SELECT id FROM build_jobs WHERE id = \?1 OR retry_of = \?1\)[^"]*)"/)![1];
    const row = await db.prepare(sql).bind("j1").first<{ id: string }>();
    expect(row?.id).toBe("d");
  });
});
