import { Blocks, LibraryBig, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { T } from "@/components/prefs";
import { TemplateCard } from "@/components/template-card";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { TEMPLATES } from "@/data/templates";

const FEATURES = [
  { Icon: LibraryBig, title: "feature.catalog.title", body: "feature.catalog.body" },
  { Icon: Blocks, title: "feature.builder.title", body: "feature.builder.body" },
  { Icon: Sparkles, title: "feature.agent.title", body: "feature.agent.body" },
  { Icon: ShieldCheck, title: "feature.safe.title", body: "feature.safe.body" },
] as const;

const SAMPLE = `nvm install --lts
nvm use --lts
npx create-next-app@latest nvx-dashboard --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
cd nvx-dashboard
npm install recharts
npm run dev`;

function SectionHeading({ id, k, eyebrow, children }: { id: string; k: Parameters<typeof T>[0]["k"]; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-sm font-semibold text-link">{eyebrow}</p>}
        <h2 id={id} className="mt-1 text-3xl font-semibold tracking-tight text-fg sm:text-[40px] sm:leading-[1.1]">
          <T k={k} />
        </h2>
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <section className="hero-glow border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-32">
          <div>
            <Badge variant="primary" className="rounded-full px-3 py-1">
              <T k="hero.badge" />
            </Badge>
            <h1 className="mt-6 text-[44px] font-bold leading-[1.08] tracking-tighter text-fg sm:text-display">
              <T k="hero.title" />
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
              <T k="hero.subtitle" />
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/builder#agent" className={buttonClasses("primary", "lg")}>
                <Sparkles className="h-[18px] w-[18px]" aria-hidden /> <T k="hero.ctaAgent" />
              </Link>
              <Link href="/templates" className={buttonClasses("secondary", "lg")}>
                <T k="hero.ctaTemplates" />
              </Link>
            </div>
          </div>
          <Card className="overflow-hidden border-code-border bg-code-bg p-0 shadow-lg" aria-label="Example command sequence">
            <div className="relative flex items-center gap-2 border-b border-code-border bg-white/[0.04] px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-close)]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-min)]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[var(--nvx-chrome-zoom)]" aria-hidden />
              <span className="absolute left-1/2 -translate-x-1/2 font-mono text-xs text-code-muted">setup.sh — zsh</span>
            </div>
            <pre className="overflow-x-auto bg-code-bg p-5 font-mono text-[13px] leading-7 text-code-fg">
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
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:py-24" aria-labelledby="how">
        <SectionHeading id="how" k="home.how" />
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {(["home.how1", "home.how2", "home.how3"] as const).map((k, i) => (
            <li key={k}>
              <Card className="flex h-full items-center gap-4 p-6">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-fg" aria-hidden>
                  {i + 1}
                </span>
                <span className="font-medium text-fg">
                  <T k={k} />
                </span>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:pb-24" aria-labelledby="popular">
        <SectionHeading id="popular" k="home.popular">
          <Link href="/templates" className={buttonClasses("ghost", "sm")}>
            <T k="home.viewAll" />
          </Link>
        </SectionHeading>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.slice(0, 6).map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface/60" aria-labelledby="features">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:py-24">
          <SectionHeading id="features" k="features.title" />
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-1">
                <div className="tool-tile grid h-12 w-12 place-items-center rounded-[13px] text-accent" aria-hidden>
                  <f.Icon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-fg">
                  <T k={f.title} />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  <T k={f.body} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
