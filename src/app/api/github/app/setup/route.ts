import { connection } from "next/server";

/** GET /api/github/app/setup — GitHub's post-install redirect. Installations are bound on the next webhook / import. */
export async function GET(req: Request) {
  await connection();
  return Response.redirect(new URL("/projects?github_app=installed", req.url).toString(), 302);
}
