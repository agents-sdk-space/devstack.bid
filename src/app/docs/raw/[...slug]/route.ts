import { DOC_EXTRAS, DOCS, getDocByRawSlug, MARKDOWN_HEADERS } from "@/lib/docs";

// Raw Markdown for people and AI agents: /docs/raw/<slug> (also reachable as /docs/<slug>.md via a
// rewrite in next.config.ts). Prerendered at build time; the body is the exact file from docs/.
export function generateStaticParams() {
  return [
    ...DOCS.map((d) => ({ slug: (d.slug || "index").split("/") })),
    ...DOC_EXTRAS.map((e) => ({ slug: e.path.split("/") })),
  ];
}

export async function GET(_req: Request, { params }: RouteContext<"/docs/raw/[...slug]">) {
  const { slug } = await params;
  const extra = DOC_EXTRAS.find((e) => e.path === slug.join("/"));
  if (extra) return new Response(extra.raw, { headers: { ...MARKDOWN_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
  const doc = getDocByRawSlug(slug);
  if (!doc) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(doc.raw, { headers: { ...MARKDOWN_HEADERS, "Content-Disposition": `inline; filename="${doc.file.split("/").pop()}"` } });
}
