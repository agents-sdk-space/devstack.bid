import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai, Inter } from "next/font/google";
import { Footer, Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs";
import "./globals.css";

// Inter (SF-like) for headings and body, IBM Plex Sans Thai for Thai glyphs, IBM Plex Mono for code
// (see --font-sans / --font-mono in globals.css).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const plexThai = IBM_Plex_Sans_Thai({ variable: "--font-thai", subsets: ["thai"], weight: ["400", "500", "600", "700"], display: "swap" });

// Absolute base for Open Graph / Twitter image URLs. Override at build time with NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://devstack.bid";
const DESCRIPTION =
  "Turn npm, nvm, npx, pip and PyPI command sequences into ordered, runnable Stack Templates. AI agent scaffolds dashboards, internal tools, collaborative workspaces, games and AI apps. Thai + English.";

// favicon.ico, icon.png, apple-icon.png, opengraph-image.png and manifest.ts in this folder are
// picked up by Next.js file conventions (see scripts/gen-brand-assets.py).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NVX Stack Builder — runnable Stack Templates for Node.js & Python",
    template: "%s · NVX Stack Builder",
  },
  description: DESCRIPTION,
  applicationName: "NVX Stack Builder",
  keywords: ["npm", "nvm", "npx", "pip", "PyPI", "Next.js", "Python", "scaffold", "stack template", "AI agent"],
  openGraph: {
    type: "website",
    siteName: "NVX Stack Builder",
    title: "NVX Stack Builder",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "NVX Stack Builder", description: DESCRIPTION },
};

export const viewport: Viewport = {
  // The black theme is the default for everyone, regardless of the OS preference.
  themeColor: "#000000",
  // Full-height app pages (/chat) use 100dvh + safe-area insets; the on-screen keyboard shrinks the layout instead of covering the composer.
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" suppressHydrationWarning className={`dark ${inter.variable} ${plexMono.variable} ${plexThai.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col overflow-x-clip font-sans">
        <Providers>
          <Header />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
