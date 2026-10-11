import type { Metadata } from "next";
import { DocView } from "@/components/docs/doc-view";
import { getDoc, rawPath } from "@/lib/docs";

const doc = getDoc("")!;

export const metadata: Metadata = {
  title: "Docs",
  description: doc.description,
  alternates: { canonical: "/docs", types: { "text/markdown": rawPath("") } },
};

export default function DocsHome() {
  return <DocView doc={doc} landing />;
}
