import { openApiSpec } from "@/lib/agent/openapi";

export async function GET() {
  return Response.json(openApiSpec(), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
