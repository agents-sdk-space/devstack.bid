import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Thai } from "next/font/google";
import { Footer, Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

// Terminal theme: IBM Plex Mono for UI chrome/headings/code, IBM Plex Sans for Latin body text,
// IBM Plex Sans Thai for Thai glyphs in both stacks (see --font-sans / --font-mono in globals.css).
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
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
  // The black terminal theme is the default for everyone, regardless of the OS preference.
  themeColor: "#030303",
};

// Runs before first paint: apply saved theme + language without a flash.
// Dark (terminal) is the default; only an explicit saved "light" choice switches it off.
const PREFS_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('nvx-theme');var dark=t!=='light';d.classList.toggle('dark',dark);var l=localStorage.getItem('nvx-lang')||((navigator.language||'').toLowerCase().indexOf('th')===0?'th':'en');d.dataset.lang=l;d.lang=l;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" suppressHydrationWarning className={`dark ${plexMono.variable} ${plexSans.variable} ${plexThai.variable} h-full`}>
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
