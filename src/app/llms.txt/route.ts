import { llmsTxt } from "@/lib/docs";

// Index of all docs as raw Markdown URLs for AI agents (https://llmstxt.org). Prerendered.
export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" },
  });
}
