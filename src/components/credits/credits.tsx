import { CREDITS, NOT_AFFILIATED, type Credit } from "@/lib/deploy/credits";

/** "Built with / Credits": name, source link and license per upstream. Logos only where the brand allows (none today: text-only). */
export function Credits({ items = CREDITS, className = "" }: { items?: Credit[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="credits-h" className={`border-t border-border pt-5 ${className}`}>
      <h2 id="credits-h" className="text-sm font-semibold text-fg">Built with / Credits</h2>
      <ul className="mt-3 space-y-2">
        {items.map((c) => (
          <li key={c.url} className="text-sm text-subtle">
            {c.logo && <img src={c.logo.src} alt="" className="mr-2 inline h-4 w-4 align-text-bottom" />}
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-fg underline underline-offset-4">{c.name}</a>
            {" "}by {c.owner} · {c.license} · <span className="font-mono text-xs">{c.version}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-subtle">{NOT_AFFILIATED} {items.map((c) => c.trademark).join(" ")} See <a href="https://github.com/agents-sdk-space/devstack.bid/blob/main/THIRD_PARTY_NOTICES.md" className="underline underline-offset-4">THIRD_PARTY_NOTICES.md</a>.</p>
    </section>
  );
}
