import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, FileCode2, FileText, PencilLine } from "lucide-react";
import { L, T } from "@/components/prefs";
import { DOCS_NAV, pagePath, prevNext, rawPath, repoUrl, sectionOf, type DocPage } from "@/lib/docs";
import { TerminalSignature } from "@/components/brand/terminal-signature";
import { CopyMarkdownButton, DocArticle } from "./doc-article";
import { DocToc, MobileToc } from "./doc-toc";

const chip = "docs-state focus-ring inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-fg";

/** One docs page: breadcrumbs, title + actions, rendered Markdown, prev/next and the on-page TOC. */
export function DocView({ doc, landing = false }: { doc: DocPage; landing?: boolean }) {
  const section = sectionOf(doc);
  const { prev, next } = prevNext(doc.slug);
  const repo = repoUrl();
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13.5rem] xl:gap-12">
      <article className="min-w-0" aria-labelledby="doc-title">
        <nav aria-label="Breadcrumb" className="docs-ui mb-5 text-[13px] text-subtle">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/docs" className="focus-ring rounded hover:text-fg">
                <T k="docs.title" />
              </Link>
            </li>
            {!landing && section && (
              <>
                <li aria-hidden>
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
                <li>
                  <L en={section.label.en} th={section.label.th} />
                </li>
                <li aria-hidden>
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
                <li aria-current="page" className="min-w-0 truncate text-muted">
                  {doc.navTitle}
                </li>
              </>
            )}
          </ol>
        </nav>

        {landing ? (
          <header className="docs-hero mb-10 rounded-[28px] border border-border p-6 sm:p-10">
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-8">
              <div>
                <p className="docs-ui text-sm font-medium text-link">DevStack · devstack.bid</p>
                <h1 id="doc-title" className="docs-display mt-2 text-4xl font-semibold text-fg sm:text-5xl">
                  {doc.title}
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted">{doc.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href="/docs/user-guide/getting-started"
                    className="docs-ui focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                  >
                    <L en="Get started" th="เริ่มต้นใช้งาน" />
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <CopyMarkdownButton raw={doc.raw} className={chip} />
                  <a href={rawPath(doc.slug)} className={chip}>
                    <FileCode2 className="h-4 w-4 text-subtle" aria-hidden />
                    <T k="docs.viewRaw" />
                  </a>
                  <a href="/llms.txt" className={chip}>
                    <FileText className="h-4 w-4 text-subtle" aria-hidden />
                    <T k="docs.forAgents" />
                  </a>
                </div>
              </div>
              <TerminalSignature className="mx-auto mt-8 max-w-[15rem] lg:mt-1" />
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DOCS_NAV.sections
                .filter((s) => s.id !== "start" && s.pages.length)
                .map((s) => (
                  <li key={s.id}>
                    <Link href={pagePath(s.pages[0].slug)} className="docs-state docs-card focus-ring block h-full rounded-2xl border border-border p-4">
                      <span className="docs-ui block text-[15px] font-semibold text-fg">
                        <L en={s.label.en} th={s.label.th} />
                      </span>
                      <span className="mt-1 block text-xs text-subtle">
                        {s.pages.length} ·{" "}
                        {s.pages
                          .slice(0, 2)
                          .map((p) => p.navTitle)
                          .join(", ")}
                        {s.pages.length > 2 ? "…" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </header>
        ) : (
          <header className="mb-8 border-b border-border pb-6">
            <h1 id="doc-title" className="docs-display text-3xl font-semibold text-fg sm:text-[40px] sm:leading-[1.15]">
              {doc.title}
            </h1>
            <div className="mt-5 flex flex-wrap gap-2">
              <CopyMarkdownButton raw={doc.raw} className={chip} />
              <a href={rawPath(doc.slug)} className={chip}>
                <FileCode2 className="h-4 w-4 text-subtle" aria-hidden />
                <T k="docs.viewRaw" />
              </a>
              {repo && (
                <a href={`${repo}/edit/main/${doc.file}`} target="_blank" rel="noopener noreferrer" className={chip}>
                  <PencilLine className="h-4 w-4 text-subtle" aria-hidden />
                  <T k="docs.edit" />
                </a>
              )}
            </div>
          </header>
        )}

        <MobileToc toc={doc.toc} />
        <DocArticle html={doc.html} />

        <p className="docs-ui mt-12 text-xs text-subtle">
          <T k="docs.source" />: <code className="font-mono">{doc.file}</code> ·{" "}
          <a href={rawPath(doc.slug)} className="link">
            {rawPath(doc.slug)}
          </a>
        </p>

        {(prev || next) && (
          <nav aria-label="Pagination" className="mt-6 grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link href={pagePath(prev.slug)} rel="prev" className="docs-state docs-card focus-ring rounded-2xl border border-border p-4">
                <span className="docs-ui flex items-center gap-1 text-xs text-subtle">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> <T k="docs.prev" />
                </span>
                <span className="docs-ui mt-1 block font-medium text-fg">{prev.navTitle}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next && (
              <Link href={pagePath(next.slug)} rel="next" className="docs-state docs-card focus-ring rounded-2xl border border-border p-4 text-right">
                <span className="docs-ui flex items-center justify-end gap-1 text-xs text-subtle">
                  <T k="docs.next" /> <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="docs-ui mt-1 block font-medium text-fg">{next.navTitle}</span>
              </Link>
            )}
          </nav>
        )}
      </article>
      <aside className="hidden xl:block">
        <DocToc toc={doc.toc} />
      </aside>
    </div>
  );
}
