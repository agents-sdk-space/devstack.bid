import { T } from "@/components/prefs";
import { buttonClasses } from "@/components/ui";

/**
 * Home "try it live" block. A static preview of a React component plus a link to the Studio,
 * whose open-source live preview (Sucrase + sandboxed iframe) runs the code in the visitor's
 * browser. An embedded Sandpack editor was evaluated and parked: its required dependency
 * @codesandbox/nodebox is under the Sustainable Use License (not permissive). See
 * docs/design/ui-ux-revamp-plan.md section 14.
 */
const LIVE_APP = `export default function App() {
  const steps = [
    "npx create-next-app@latest my-app",
    "cd my-app",
    "npm run dev",
  ];
  return (
    <ol>
      {steps.map((s) => <li key={s}>{s}</li>)}
    </ol>
  );
}`;

export function LiveExample() {
  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-code-bg md:grid-cols-[1.4fr_1fr]">
      <pre tabIndex={0} aria-label="App.jsx" className="focus-ring overflow-x-auto p-4 font-mono text-xs leading-relaxed text-code-fg sm:p-5 sm:text-[13px]">{LIVE_APP}</pre>
      <div className="flex flex-col justify-center gap-4 border-t border-border bg-bg p-5 md:border-l md:border-t-0">
        <ol className="list-decimal space-y-1 pl-5 font-mono text-xs text-fg">
          <li>npx create-next-app@latest my-app</li>
          <li>cd my-app</li>
          <li>npm run dev</li>
        </ol>
        <a href="/studio/" className={buttonClasses("secondary")}>
          <T k="home.live.open" />
        </a>
      </div>
    </div>
  );
}
