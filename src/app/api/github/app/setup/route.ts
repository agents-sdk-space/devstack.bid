import { connection } from "next/server";

/** GitHub's post-install redirect.
 * An installation is NOT an imported DevStack project or a user OAuth grant.
 * Send the user directly to the real Import Git flow, where OAuth connection
 * and project linking can be completed. No installation state is fabricated.
 */
export async function GET(req: Request) {
  await connection();
  const target = new URL("/new", req.url);
  target.searchParams.set("mode", "git");
  target.searchParams.set("github_app", "installed");
  return Response.redirect(target.toString(), 302);
}
