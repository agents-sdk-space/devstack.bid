import { llmsFullTxt } from "@/lib/docs";

// Every doc page's Markdown in one file, for agents that prefer a single fetch. Prerendered.
export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600", "Access-Control-Allow-Origin": "*" },
  });
}
