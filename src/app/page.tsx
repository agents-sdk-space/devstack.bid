import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";
import { FeaturedTemplates } from "@/components/home/featured-templates";
import { LiveExample } from "@/components/home/live-example";
import { T } from "@/components/prefs";
import { Badge, buttonClasses, Card } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";

const HOME_DESCRIPTION =
  "DevStack (devstack.bid) — NVX Stack Builder developer tools: pick a template or describe your app and get every setup command, in the right order, ready to copy.";

/** Home overrides the site-wide description and keywords: the home page carries no version-manager commands. */
export const metadata: Metadata = {
  description: HOME_DESCRIPTION,
  keywords: ["devstack.bid", "NVX Stack Builder", "developer tools", "npm", "npx", "pip", "PyPI", "stack template", "AI agent", "MCP"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "NVX Stack Builder",
    title: "NVX Stack Builder — DevStack developer tools",
    description: HOME_DESCRIPTION,
    url: "/",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "NVX Stack Builder on devstack.bid" }],
  },
  twitter: { card: "summary_large_image", title: "NVX Stack Builder — DevStack", description: HOME_DESCRIPTION, images: ["/opengraph-image.png"] },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "NVX Stack Builder",
      alternateName: "DevStack",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: "https://devstack.bid/",
      description: HOME_DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "Organization",
      name: "DevStack",
      url: "https://devstack.bid/",
      sameAs: ["https://github.com/agents-sdk-space/devstack.bid"],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "devstack.sdk@gmail.com",
        url: "https://devstack.bid/contact",
      },
      address: {
        "@type": "PostalAddress",
        addressCountry: "TH",
        addressLocality: "Bangkok",
      },
    },
  ],
};

/** Home hero sample. Deliberately has no version-manager step: home shows the shortest path. */
const SAMPLE = `npx create-next-app@latest nvx-dashboard --ts --tailwind --app --yes
cd nvx-dashboard
npm install recharts
npm run dev`;

const STEPS: DictKey[] = ["home.steps.1", "home.steps.2", "home.steps.3"];
const FAQ: [DictKey, DictKey][] = [
  ["home.faq.q1", "home.faq.a1"],
  ["home.faq.q2", "home.faq.a2"],
  ["home.faq.q3", "home.faq.a3"],
  ["home.faq.q4", "home.faq.a4"],
];

function H2({ id, k }: { id: string; k: DictKey }) {
  return (
    <h2 id={id} className="text-3xl font-semibold tracking-tight text-fg sm:text-h2 sm:leading-[1.1]">
      <T k={k} />
    </h2>
  );
}

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <section className="hero-glow border-b border-border">
        <div className="mx-auto grid max-w-content grid-cols-1 items-center gap-8 [&>*]:min-w-0 px-4 py-12 sm:py-section-sm lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-section">
          <div>
            <Badge className="rounded-full px-3 py-1">
              <T k="hero.badge" />
            </Badge>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-tighter text-fg sm:mt-6 sm:text-display">
              <T k="hero.title" />
            </h1>
            <p className="mt-4 max-w-measure text-lg leading-relaxed text-muted sm:mt-6 sm:text-lead">
              <T k="hero.subtitle" />
            </p>
            <div className="mt-6 flex flex-wrap gap-3 max-sm:[&>a]:flex-1 max-sm:[&>a]:basis-36 max-sm:[&>a]:px-3 sm:mt-10">
              <Link href="/learn" className={buttonClasses("primary", "lg")}>
                <T k="home.ctaStart" /> <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
              </Link>
              <Link href="/templates" className={buttonClasses("secondary", "lg")}>
                <T k="home.ctaBrowse" />
              </Link>
            </div>
          </div>
          <div className="focus-frame">
            <span className="focus-frame-corner" data-c="tl" aria-hidden />
            <span className="focus-frame-corner" data-c="tr" aria-hidden />
            <span className="focus-frame-corner" data-c="bl" aria-hidden />
            <span className="focus-frame-corner" data-c="br" aria-hidden />
<Card className="relative overflow-hidden border-code-border bg-code-bg p-0 shadow-lg" aria-label="Example command sequence">
                  <div className="relative flex items-center gap-2 border-b border-code-border bg-white/[0.04] px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-close)]" aria-hidden />
                    <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-min)]" aria-hidden />
                    <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-zoom)]" aria-hidden />
                    <span className="absolute left-1/2 -translate-x-1/2 font-mono text-xs text-code-muted">setup.sh — zsh</span>
                  </div>
                  <pre tabIndex={0} aria-label="Example setup commands" className="focus-ring overflow-x-auto bg-code-bg p-4 font-mono text-xs leading-6 sm:p-5 sm:text-[13px] sm:leading-7 text-code-fg">
                    {SAMPLE.split("\n").map((line, i) => (
                      <div key={i}>
                        <span className="select-none text-code-muted">{String(i + 1).padStart(2, " ")} </span>
                        <span className="text-code-prompt">$</span> {line}
                      </div>
                    ))}
                    <div aria-hidden>
                      <span className="select-none text-code-muted">{String(SAMPLE.split("\n").length + 1).padStart(2, " ")} </span>
                      <span className="text-code-prompt">$</span>
                      <span className="term-cursor" />
                    </div>
                  </pre>
                  {/* Decorative mascot resting in the empty bottom-right corner of the code window. */}
                  <Mascot size={96} interactive className="hero-mascot absolute bottom-2 right-2 max-sm:h-[64px]! max-sm:w-[64px]! sm:bottom-3 sm:right-4" />
                </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-12 sm:py-section-sm" aria-labelledby="steps">
        <div className="text-center">
          <H2 id="steps" k="home.steps.title" />
        </div>
        <ol className="relative mt-6 grid gap-4 sm:mt-12 sm:gap-6 sm:grid-cols-3">
          <span className="absolute left-[16.66%] right-[16.66%] top-5 hidden h-px bg-border sm:block" aria-hidden />
          {STEPS.map((k, i) => (
            <li key={k} className="relative flex items-center gap-4 sm:flex-col sm:text-center">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-strong bg-bg font-mono text-sm font-semibold text-fg" aria-hidden>
                {i + 1}
              </span>
              <span className="font-medium text-fg">
                <T k={k} />
              </span>
            </li>
          ))}
        </ol>
        <figure className="mx-auto mt-10 max-w-3xl sm:mt-14" data-slot="howto-video" aria-labelledby="video-title">
          {/* Placeholder: a ~30s how-to video goes here. See docs/design/ui-ux-revamp-plan.md (video slots). */}
          <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border-strong bg-surface text-center">
            <div className="px-6">
              <p id="video-title" className="font-semibold text-fg"><T k="home.video.title" /></p>
              <p className="mt-1 text-sm text-muted"><T k="home.video.soon" /></p>
            </div>
          </div>
        </figure>
      </section>

      <section className="border-t border-border" aria-labelledby="live">
        <div className="mx-auto max-w-content px-4 py-12 sm:py-section-sm">
          <H2 id="live" k="home.live.title" />
          <p className="mt-3 max-w-measure text-muted"><T k="home.live.body" /></p>
          <div className="mt-8">
            <LiveExample />
          </div>
        </div>
      </section>

      <section className="border-t border-border" aria-labelledby="popular">
        <div className="mx-auto max-w-content px-4 py-12 sm:py-section-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <H2 id="popular" k="home.popular" />
              <p className="mt-3 text-muted"><T k="home.popular.body" /></p>
            </div>
            <Link href="/templates" className="link inline-flex items-center gap-1 text-sm font-medium">
              <T k="home.viewAll" /> <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <FeaturedTemplates />
        </div>
      </section>

      <section className="border-t border-border bg-surface/60" aria-labelledby="faq">
        <div className="mx-auto grid max-w-content gap-8 px-4 py-12 sm:py-section-sm lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <H2 id="faq" k="home.faq.title" />
            <p className="mt-3 text-muted"><T k="home.faq.body" /></p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
                  <T k={q} />
                  <span className="text-xl leading-none text-subtle transition-transform group-open:rotate-45 motion-reduce:transition-none" aria-hidden>+</span>
                </summary>
                <p className="pb-4 text-sm leading-relaxed text-muted"><T k={a} /></p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border" aria-labelledby="final-cta">
        <div className="mx-auto max-w-content px-4 py-12 text-center sm:py-section-sm">
          <h2 id="final-cta" className="text-3xl font-semibold tracking-tight text-fg sm:text-h2"><T k="home.cta.title" /></h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/learn" className={buttonClasses("primary", "lg")}><T k="home.ctaStart" /></Link>
            <Link href="/templates" className={buttonClasses("secondary", "lg")}><T k="home.ctaBrowse" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
