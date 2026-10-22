import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { wantsMarkdown, markdownResponse } from "@/lib/agent/accept";
import { homeMarkdown, notFoundMarkdown } from "@/lib/agent/markdown-pages";
import { isKnownApiPath } from "@/lib/agent/api-paths";
import { isKnownSitePath } from "@/lib/agent/site-paths";
import { apiError } from "@/lib/server/api-error";
import { legacyAuthMigration } from "@/lib/chat/identity";

/** Attach legacy-cookie migration headers (nvx_auth -> __Host-nvx_auth) to a response. */
function withCookieMigration(req: NextRequest, res: Response): Response {
  for (const c of legacyAuthMigration(req.headers.get("cookie"), req.nextUrl.protocol === "https:")) res.headers.append("Set-Cookie", c);
  return res;
}

export function middleware(req: NextRequest) {
  return withCookieMigration(req, route(req));
}

function route(req: NextRequest): Response {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && !isKnownApiPath(pathname) && req.method !== "OPTIONS") {
    return apiError("not_found", "Unknown API path", 404, "See /openapi.json for supported routes.");
  }

  if (!wantsMarkdown(req)) return NextResponse.next();

  if (pathname === "/" || pathname === "") {
    return markdownResponse(homeMarkdown());
  }

  if (!isKnownSitePath(pathname)) {
    return markdownResponse(notFoundMarkdown(pathname), 404);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"],
};
