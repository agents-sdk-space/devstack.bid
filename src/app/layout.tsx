import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import { Footer, Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Thai glyphs come from IBM Plex Sans Thai; Latin from Geist (see --font-sans in globals.css).
const plexThai = IBM_Plex_Sans_Thai({ variable: "--font-thai", subsets: ["thai"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "NVX Stack Builder — runnable Stack Templates for Node.js & Python",
    template: "%s · NVX Stack Builder",
  },
  description:
    "Turn npm, nvm, npx, pip and PyPI command sequences into ordered, runnable Stack Templates. AI agent scaffolds dashboards, internal tools, collaborative workspaces, games and AI apps. Thai + English.",
  applicationName: "NVX Stack Builder",
  keywords: ["npm", "nvm", "npx", "pip", "PyPI", "Next.js", "Python", "scaffold", "stack template", "AI agent"],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

// Runs before first paint: apply saved theme + language without a flash.
const PREFS_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('nvx-theme');var dark=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;d.classList.toggle('dark',dark);var l=localStorage.getItem('nvx-lang')||((navigator.language||'').toLowerCase().indexOf('th')===0?'th':'en');d.dataset.lang=l;d.lang=l;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${plexThai.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
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
