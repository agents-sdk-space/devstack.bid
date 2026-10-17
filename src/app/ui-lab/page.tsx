import type { Metadata } from "next";
import { GlowCardsDemo } from "@/components/ui-lab/glow-cards-demo";
import { SplineSceneLazy } from "@/components/ui-lab/spline-scene-lazy";

// Internal component lab: not linked from the nav, not in the sitemap, not indexed.
export const metadata: Metadata = {
  title: "UI lab",
  description: "Internal preview of experimental UI components.",
  robots: { index: false, follow: false },
};

export default function UiLabPage() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-16 sm:px-6">
      <header className="mb-10 max-w-measure">
        <p className="font-mono text-xs uppercase tracking-wider text-subtle">Internal · UI lab</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg">Glow cards &amp; 3D scene</h1>
        <p className="mt-3 text-muted">
          Preview of <code>GlowCard</code> (spotlight-card) and <code>SplineScene</code>. Move the pointer around the page.
        </p>
      </header>

      <section aria-labelledby="glow-title" className="mb-16">
        <h2 id="glow-title" className="mb-6 text-xl font-semibold text-fg">GlowCard</h2>
        <GlowCardsDemo />
      </section>

      <section aria-labelledby="spline-title">
        <h2 id="spline-title" className="mb-6 text-xl font-semibold text-fg">SplineScene</h2>
        <SplineSceneLazy />
      </section>
    </div>
  );
}
