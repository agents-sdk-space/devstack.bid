import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { inspectRepo } from "@/lib/projects/import";

/** GET /api/github/inspect?repo=owner/name&ref=&root= — branches, candidate roots, detected framework (read-only). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "gh-inspect", perMinute: 30 });
  if (isResponse(a)) return a;
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  const u = new URL(req.url);
  try {
    return json(await inspectRepo(token, { repo: u.searchParams.get("repo"), ref: u.searchParams.get("ref"), root: u.searchParams.get("root") }), 200, { "Cache-Control": "no-store" });
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
