/** Accept: text/markdown negotiation helpers for agent-facing HTTP responses. */

export function wantsMarkdown(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return /\btext\/markdown\b/i.test(accept);
}

export const MARKDOWN_NEGOTIATION_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=3600",
  "Vary": "Accept",
} as const;

export function markdownResponse(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...MARKDOWN_NEGOTIATION_HEADERS, ...extra } });
}
