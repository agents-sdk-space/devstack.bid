import Link from "next/link";
import { T } from "@/components/prefs";
import { TemplateCard } from "@/components/template-card";
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

export default function Home() {
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="chip border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
              <T k="hero.badge" />
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              <T k="hero.title" />
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-300">
              <T k="hero.subtitle" />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/builder#agent" className="btn-primary px-5 py-3 text-base">
                🤖 <T k="hero.ctaAgent" />
              </Link>
              <Link href="/templates" className="btn-secondary px-5 py-3 text-base">
                <T k="hero.ctaTemplates" />
              </Link>
            </div>
          </div>
          <div className="card overflow-hidden p-0" aria-label="Example command sequence">
            <div className="flex items-center gap-1.5 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <span className="h-3 w-3 rounded-full bg-red-400" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-amber-400" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-emerald-400" aria-hidden />
              <span className="ml-2 font-mono text-xs text-slate-500">setup.sh</span>
            </div>
            <pre className="overflow-x-auto bg-slate-950 p-5 font-mono text-[13px] leading-7 text-slate-100">
              {SAMPLE.split("\n").map((line, i) => (
                <div key={i}>
                  <span className="select-none text-slate-500">{String(i + 1).padStart(2, " ")} </span>
                  <span className="text-emerald-400">$</span> {line}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="features">
        <h2 id="features" className="text-2xl font-bold">
          <T k="features.title" />
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <div className="text-2xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mt-3 font-semibold">
                <T k={f.title} />
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                <T k={f.body} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold">
          <T k="home.how" />
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {(["home.how1", "home.how2", "home.how3"] as const).map((k, i) => (
            <li key={k} className="card flex items-center gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 font-bold text-white" aria-hidden>
                {i + 1}
              </span>
              <span className="font-medium">
                <T k={k} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="popular">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="popular" className="text-2xl font-bold">
            <T k="home.popular" /> <span className="text-slate-400">({TEMPLATES.length})</span>
          </h2>
          <Link href="/templates" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            <T k="home.viewAll" />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.slice(0, 6).map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      </section>
    </>
  );
}
