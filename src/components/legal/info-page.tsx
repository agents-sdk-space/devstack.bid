import { L } from "@/components/prefs";

type Tx = { en: string; th: string };
export type InfoSection = { heading: Tx; body: Tx };

/** Minimal monochrome page used for footer pages (support, status, legal). Placeholder content. */
export function InfoPage({ title, intro, sections }: { title: Tx; intro: Tx; sections: InfoSection[] }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-4xl font-bold tracking-tighter text-fg sm:text-5xl"><L {...title} /></h1>
      <p className="mt-4 text-muted"><L {...intro} /></p>
      <div className="mt-10 divide-y divide-border border-y border-border">
        {sections.map((s) => (
          <section key={s.heading.en} className="py-6">
            <h2 className="text-lg font-medium text-fg"><L {...s.heading} /></h2>
            <p className="mt-2 leading-relaxed text-muted"><L {...s.body} /></p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-caption text-muted">
        <L en="Last updated: October 2026. This page is a draft and may change." th="อัปเดตล่าสุด: ตุลาคม 2026 หน้านี้เป็นฉบับร่างและอาจเปลี่ยนแปลง" />
      </p>
    </div>
  );
}
