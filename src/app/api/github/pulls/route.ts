import { connection } from "next/server";
import { handleChanges } from "@/lib/connections/changes-route";
import { gate, isResponse } from "@/lib/connections/route-kit";

/** POST /api/github/pulls?repo=owner/name&base=main — same as /api/projects/:id/changes for any repo the user can push to. */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "gh-pr", perMinute: 6 });
  if (isResponse(a)) return a;
  const url = new URL(req.url);
  return handleChanges(req, a, { repo: url.searchParams.get("repo") ?? "", base: url.searchParams.get("base") ?? "main" });
}
