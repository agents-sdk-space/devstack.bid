import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocView } from "@/components/docs/doc-view";
import { DOCS, getDoc, pagePath, rawPath } from "@/lib/docs";

// Every page is prerendered from the docs bundle. Unknown slugs get a real 404 via the rewrite in
// next.config.ts (notFound() alone would stream after a 200 shell with Cache Components).
export function generateStaticParams() {
  return DOCS.filter((d) => d.slug).map((d) => ({ slug: d.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[...slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug.join("/"));
  if (!doc) return {};
  return {
    title: `${doc.navTitle} · Docs`,
    description: doc.description,
    alternates: { canonical: pagePath(doc.slug), types: { "text/markdown": rawPath(doc.slug) } },
  };
}

export default async function DocsPage({ params }: PageProps<"/docs/[...slug]">) {
  const { slug } = await params;
  const doc = getDoc(slug.join("/"));
  if (!doc) notFound();
  return <DocView doc={doc} />;
}
