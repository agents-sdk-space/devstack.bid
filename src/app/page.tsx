import { ArrowRight, Bot, GitBranch, FolderGit2, KeyRound, LayoutTemplate, Terminal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";
import { FeaturedTemplates } from "@/components/home/featured-templates";
import { LiveExample } from "@/components/home/live-example";
import { T } from "@/components/prefs";
import { ForYou } from "@/components/activity";
import { Badge, buttonClasses, Card } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";

const HOME_DESCRIPTION =
  "DevStack (devstack.bid): import a GitHub repo, start from a template or build with AI chat, and get a live *.devstack.bid site in minutes. Every git push redeploys; branches get preview URLs.";

/** Home overrides the site-wide description and keywords: the home page carries no version-manager commands. */
export const metadata: Metadata = {
  description: HOME_DESCRIPTION,
  keywords: ["devstack.bid", "deploy GitHub repo", "static hosting", "Next.js OpenNext", "preview deployments", "AI site builder", "templates", "devstack-bid CLI"],
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

/** Home hero sample: the git-push → live-site loop that works today. */
const SAMPLE = `git commit -am "new hero section"
git push origin main
# devstack: build queued (production)
# devstack: live at https://my-app.devstack.bid`;

const STEPS: DictKey[] = ["home.steps2.1", "home.steps2.2", "home.steps2.3"];
const NOW: [typeof FolderGit2, DictKey, DictKey, string][] = [
  [FolderGit2, "home.now.import.t", "home.now.import.b", "/new"],
  [LayoutTemplate, "home.now.template.t", "home.now.template.b", "/new?mode=template"],
  [Bot, "home.now.ai.t", "home.now.ai.b", "/chat"],
  [GitBranch, "home.now.git.t", "home.now.git.b", "/projects"],
  [KeyRound, "home.now.signin.t", "home.now.signin.b", "/login"],
  [Terminal, "home.now.cli.t", "home.now.cli.b", "/cli"],
];
const FAQ: [DictKey, DictKey][] = [
  ["home.faq2.q1", "home.faq2.a1"],
  ["home.faq2.q2", "home.faq2.a2"],
  ["home.faq2.q3", "home.faq2.a3"],
  ["home.faq2.q4", "home.faq2.a4"],
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
              <T k="home.hero.badge" />
            </Badge>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-tighter text-fg sm:mt-6 sm:text-display">
              <T k="home.hero.title" />
            </h1>
            <p className="mt-4 max-w-measure text-lg leading-relaxed text-muted sm:mt-6 sm:text-lead">
              <T k="home.hero.subtitle" />
            </p>
            <div className="mt-6 flex flex-wrap gap-3 max-sm:[&>a]:flex-1 max-sm:[&>a]:basis-36 max-sm:[&>a]:px-3 sm:mt-10">
              <Link href="/new" className={buttonClasses("primary", "lg")}>
                <T k="home.ctaDeploy" /> <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
              </Link>
              <Link href="/chat" className={buttonClasses("secondary", "lg")}>
                <T k="home.ctaChat" />
              </Link>
            </div>
          </div>
          <div className="focus-frame">
            <span className="focus-frame-corner" data-c="tl" aria-hidden />
            <span className="focus-frame-corner" data-c="tr" aria-hidden />
            <span className="focus-frame-corner" data-c="bl" aria-hidden />
            <span className="focus-frame-corner" data-c="br" aria-hidden />
<Card className="relative overflow-hidden border-code-border bg-code-bg p-0 shadow-lg" aria-label="Example deploy by git push">
                  <div className="relative flex items-center gap-2 border-b border-code-border bg-white/[0.04] px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-close)]" aria-hidden />
                    <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-min)]" aria-hidden />
                    <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-zoom)]" aria-hidden />
                    <span className="absolute left-1/2 -translate-x-1/2 font-mono text-xs text-code-muted">my-app — zsh</span>
                  </div>
                  <pre tabIndex={0} aria-label="Example git push deploy" className="focus-ring overflow-x-auto bg-code-bg p-4 font-mono text-xs leading-6 sm:p-5 sm:text-[13px] sm:leading-7 text-code-fg">
                    {SAMPLE.split("\n").map((line, i) => (
                      <div key={i}>
                        <span className="select-none text-code-muted">{String(i + 1).padStart(2, " ")} </span>
                        {line.startsWith("#") ? <span className="text-code-muted">{line}</span> : <><span className="text-code-prompt">$</span> {line}</>}
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

      <section className="border-b border-border" aria-labelledby="now">
        <div className="mx-auto max-w-content px-4 py-12 sm:py-section-sm">
          <H2 id="now" k="home.now.title" />
          <p className="mt-3 max-w-measure text-muted"><T k="home.now.body" /></p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="capabilities">
            {NOW.map(([Icon, t, b, href]) => (
              <li key={t}>
                <Link href={href} className="focus-ring block h-full rounded-xl">
                  <Card className="h-full p-5 transition-colors hover:border-border-strong">
                    <Icon className="h-5 w-5 text-fg" aria-hidden />
                    <p className="mt-3 font-semibold text-fg"><T k={t} /></p>
                    <p className="mt-1 text-sm leading-relaxed text-muted"><T k={b} /></p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-12 sm:py-section-sm" aria-labelledby="steps">
        <div className="text-center">
          <H2 id="steps" k="home.steps2.title" />
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

      <ForYou />

      <section className="border-t border-border" aria-labelledby="final-cta">
        <div className="mx-auto max-w-content px-4 py-12 text-center sm:py-section-sm">
          <h2 id="final-cta" className="text-3xl font-semibold tracking-tight text-fg sm:text-h2"><T k="home.cta.title" /></h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/new" data-track="cta_deploy" className={buttonClasses("primary", "lg")}><T k="home.ctaDeploy" /></Link>
            <Link href="/templates" data-track="cta_browse" className={buttonClasses("secondary", "lg")}><T k="home.ctaBrowse" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
