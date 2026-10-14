import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AppWindow,
  Blocks,
  BookOpen,
  Bot,
  FlaskConical,
  KeyRound,
  Layers,
  LibraryBig,
  MessagesSquare,
  Palette,
  Plug,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { CursorSetupPanel } from "@/components/setup-cursor";
import { T } from "@/components/prefs";
import { buttonClasses, Card } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Learn DevStack",
  description:
    "A launch presentation of the whole DevStack system, made by the creator devstack.sdk@gmail.com and Cursor. Templates, builder, chat, Studio, docs, and how to create or ask in Cursor.",
};

const GROUPS: { title: DictKey; items: { href: string; document?: boolean; title: DictKey; body: DictKey; Icon: LucideIcon }[] }[] = [
  {
    title: "learn.group.build",
    items: [
      { href: "/templates", title: "learn.card.templates.title", body: "learn.card.templates.body", Icon: LibraryBig },
      { href: "/builder", title: "learn.card.builder.title", body: "learn.card.builder.body", Icon: Blocks },
      { href: "/builder#agent", title: "learn.card.agent.title", body: "learn.card.agent.body", Icon: Sparkles },
    ],
  },
  {
    title: "learn.group.talk",
    items: [
      { href: "/chat", title: "learn.card.chat.title", body: "learn.card.chat.body", Icon: MessagesSquare },
      { href: "/chat/dev", title: "learn.card.dev.title", body: "learn.card.dev.body", Icon: SquareTerminal },
      { href: "/factory", title: "learn.card.factory.title", body: "learn.card.factory.body", Icon: FlaskConical },
      { href: "/studio/", document: true, title: "learn.card.studio.title", body: "learn.card.studio.body", Icon: AppWindow },
    ],
  },
  {
    title: "learn.group.read",
    items: [
      { href: "/docs", title: "learn.card.docs.title", body: "learn.card.docs.body", Icon: BookOpen },
      { href: "/docs/platform", title: "learn.card.functions.title", body: "learn.card.functions.body", Icon: Layers },
      { href: "/docs/agents/cursor-caretakers", title: "learn.card.agents.title", body: "learn.card.agents.body", Icon: Bot },
      { href: "/design", title: "learn.card.design.title", body: "learn.card.design.body", Icon: Palette },
      { href: "/login", title: "learn.card.login.title", body: "learn.card.login.body", Icon: KeyRound },
      { href: "/docs/integrations/mcp", title: "learn.card.mcp.title", body: "learn.card.mcp.body", Icon: Plug },
    ],
  },
];

function ItemLink({ href, document, children }: { href: string; document?: boolean; children: ReactNode }) {
  const className = "focus-ring block h-full rounded-xl";
  if (document) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function LearnPage() {
  return (
    <>
      <section className="hero-glow border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <p className="text-sm font-semibold text-link">
            <T k="learn.badge" />
          </p>
          <h1 className="mt-4 max-w-3xl text-[40px] font-bold leading-[1.08] tracking-tighter text-fg sm:text-display">
            <T k="learn.title" />
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            <T k="learn.subtitle" />
          </p>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-fg">
            <T k="learn.creditBy" />{" "}
            <a href="mailto:devstack.sdk@gmail.com" className="link break-all">
              devstack.sdk@gmail.com
            </a>{" "}
            <T k="learn.creditAnd" />
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            <T k="learn.creditNote" />
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="#setup-cursor" className={buttonClasses("primary", "lg")}>
              <Sparkles className="h-[18px] w-[18px]" aria-hidden /> <T k="learn.heroCursor" />
            </a>
            <Link href="/builder#agent" className={buttonClasses("secondary", "lg")}>
              <T k="hero.ctaAgent" />
            </Link>
            <Link href="/templates" className={buttonClasses("ghost", "lg")}>
              <T k="hero.ctaTemplates" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20" aria-labelledby="learn-map">
        <h2 id="learn-map" className="text-3xl font-semibold tracking-tight text-fg">
          <T k="learn.mapTitle" />
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          <T k="learn.mapBody" />
        </p>
        <div className="mt-10 space-y-12">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-lg font-semibold text-fg">
                <T k={group.title} />
              </h3>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <ItemLink href={item.href} document={item.document}>
                      <Card interactive className="h-full p-5">
                        <div className="tool-tile grid h-11 w-11 place-items-center rounded-[13px] text-accent" aria-hidden>
                          <item.Icon className="h-5 w-5" strokeWidth={1.75} />
                        </div>
                        <p className="mt-4 font-semibold text-fg">
                          <T k={item.title} />
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                          <T k={item.body} />
                        </p>
                      </Card>
                    </ItemLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface/60" aria-labelledby="learn-how">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <h2 id="learn-how" className="text-3xl font-semibold tracking-tight text-fg">
            <T k="learn.howTitle" />
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {([
              ["learn.how1.title", "learn.how1.body"],
              ["learn.how2.title", "learn.how2.body"],
              ["learn.how3.title", "learn.how3.body"],
            ] as const).map(([title, body], i) => (
              <li key={title}>
                <Card className="h-full p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 font-semibold text-fg" aria-hidden>
                    {i + 1}
                  </span>
                  <p className="mt-4 font-semibold text-fg">
                    <T k={title} />
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    <T k={body} />
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="setup-cursor" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:py-20" aria-labelledby="learn-cursor">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <h2 id="learn-cursor" className="text-3xl font-semibold tracking-tight text-fg">
              <T k="learn.cursorTitle" />
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              <T k="learn.cursorBody" />
            </p>
          </div>
          <Card className="p-6">
            <CursorSetupPanel />
          </Card>
        </div>
      </section>

      <section className="border-t border-border" aria-labelledby="learn-safe">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <h2 id="learn-safe" className="text-2xl font-semibold tracking-tight text-fg">
            <T k="learn.safeTitle" />
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            <T k="learn.safeBody" />
          </p>
        </div>
      </section>
    </>
  );
}
