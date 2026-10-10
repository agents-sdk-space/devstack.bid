import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai, Inter } from "next/font/google";
import { Footer, Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

// Inter (SF-like) for headings and body, IBM Plex Sans Thai for Thai glyphs, IBM Plex Mono for code
// (see --font-sans / --font-mono in globals.css).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
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
  // The black theme is the default for everyone, regardless of the OS preference.
  themeColor: "#000000",
};

// Runs before first paint: apply saved theme + language without a flash.
// Dark is the default; only an explicit saved "light" choice switches it off.
const PREFS_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('nvx-theme');var dark=t!=='light';d.classList.toggle('dark',dark);var l=localStorage.getItem('nvx-lang')||((navigator.language||'').toLowerCase().indexOf('th')===0?'th':'en');d.dataset.lang=l;d.lang=l;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" suppressHydrationWarning className={`dark ${inter.variable} ${plexMono.variable} ${plexThai.variable} h-full`}>
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
