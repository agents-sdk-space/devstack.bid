"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useDarkMode, useLang } from "@/components/prefs";
import { buttonClasses } from "@/components/ui";
import { APP_TSX } from "./sandbox-files";

/**
 * react.dev-style live example (Sandpack, Apache-2.0; its nodebox dependency is an
 * owner-approved licence exception, see THIRD_PARTY_LICENSES.md). Sandpack is only
 * downloaded when the block scrolls near the viewport or the visitor presses the button.
 * The code runs in a cross-origin *.codesandbox.io iframe in the visitor's browser,
 * never on our server. CSP: docs/architecture/api-hardening.md.
 */
const LiveEditor = dynamic(() => import("./live-editor"), { ssr: false });

export function LiveExample() {
  const { t } = useLang();
  const { dark } = useDarkMode();
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || on || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setOn(true);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);

  return (
    <div ref={ref} className="min-h-[34rem] overflow-hidden rounded-xl border border-border bg-code-bg md:min-h-[26.5rem]" data-testid="live-example">
      {on ? (
        <LiveEditor dark={dark} labels={{ reset: t("home.live.reset"), open: t("home.live.open") }} />
      ) : (
        <div className="grid md:grid-cols-2">
          <pre className="h-72 overflow-auto p-4 font-mono text-xs leading-relaxed text-code-fg md:h-[26.5rem]" aria-label="App.tsx">{APP_TSX}</pre>
          <div className="flex items-center justify-center border-t border-border p-6 md:border-l md:border-t-0">
            <button type="button" className={buttonClasses("secondary")} onClick={() => setOn(true)}>
              {t("home.live.load")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
