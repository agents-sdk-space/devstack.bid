import { Space_Grotesk } from "next/font/google";
import { DocsShell } from "@/components/docs/docs-shell";
import { DOCS_NAV } from "@/lib/docs";

// Space Grotesk for docs headings and UI chrome only (Latin glyphs). Thai falls back to IBM Plex
// Sans Thai, code stays IBM Plex Mono. Loaded here so other pages don't download it.
const spaceGrotesk = Space_Grotesk({ variable: "--font-space", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className={`${spaceGrotesk.variable} docs-root`}>
      <DocsShell nav={DOCS_NAV} fontClass={spaceGrotesk.variable}>{children}</DocsShell>
    </div>
  );
}
