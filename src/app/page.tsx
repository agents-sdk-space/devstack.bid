import Link from "next/link";
import { T } from "@/components/prefs";
import { TemplateCard } from "@/components/template-card";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { TEMPLATES } from "@/data/templates";

const FEATURES = [
  { icon: "📚", title: "feature.catalog.title", body: "feature.catalog.body" },
  { icon: "🧩", title: "feature.builder.title", body: "feature.builder.body" },
  { icon: "🤖", title: "feature.agent.title", body: "feature.agent.body" },
  { icon: "🛡️", title: "feature.safe.title", body: "feature.safe.body" },
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
        {eyebrow && <p className="term-eyebrow font-mono text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>}
        <h2 id={id} className="term-section mt-1 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
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
      <section className="hero-glow term-rule border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <Badge variant="primary" className="term-eyebrow px-3 py-1">
              <T k="hero.badge" />
            </Badge>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-fg sm:text-display sm:leading-[1.1]">
              <T k="hero.title" />
              <span aria-hidden className="term-cursor" />
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              <T k="hero.subtitle" />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/builder#agent" className={buttonClasses("primary", "lg")}>
                <span aria-hidden>🤖</span> <T k="hero.ctaAgent" />
              </Link>
              <Link href="/templates" className={buttonClasses("secondary", "lg")}>
                <T k="hero.ctaTemplates" />
              </Link>
            </div>
          </div>
          <Card className="overflow-hidden p-0 shadow-lg" aria-label="Example command sequence">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
              <span className="h-2.5 w-2.5 bg-danger" aria-hidden />
              <span className="h-2.5 w-2.5 bg-warning" aria-hidden />
              <span className="h-2.5 w-2.5 bg-success" aria-hidden />
              <span className="ml-2 font-mono text-xs text-subtle">setup.sh — bash</span>
            </div>
            <pre className="overflow-x-auto bg-code-bg p-5 font-mono text-[13px] leading-7 text-code-fg">
              {SAMPLE.split("\n").map((line, i) => (
                <div key={i}>
                  <span className="select-none text-code-muted">{String(i + 1).padStart(2, " ")} </span>
                  <span className="text-code-prompt">$</span> {line}
                </div>
              ))}
            </pre>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16" aria-labelledby="how">
        <SectionHeading id="how" k="home.how" />
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {(["home.how1", "home.how2", "home.how3"] as const).map((k, i) => (
            <li key={k}>
              <Card className="flex h-full items-center gap-4 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-primary/40 bg-primary-soft font-mono font-bold text-primary-soft-fg" aria-hidden>
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

      <section className="mx-auto max-w-7xl px-4 pb-16" aria-labelledby="popular">
        <SectionHeading id="popular" k="home.popular">
          <Link href="/templates" className={buttonClasses("ghost", "sm")}>
            <T k="home.viewAll" />
          </Link>
        </SectionHeading>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.slice(0, 6).map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      </section>

      <section className="term-rule border-t border-border bg-surface/60" aria-labelledby="features">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <SectionHeading id="features" k="features.title" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-1">
                <div className="grid h-11 w-11 place-items-center rounded-sm border border-primary/30 bg-primary-soft text-xl" aria-hidden>
                  {f.icon}
                </div>
                <h3 className="mt-4 font-semibold text-fg">
                  <T k={f.title} />
                </h3>
                <p className="mt-1.5 text-sm text-muted">
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
