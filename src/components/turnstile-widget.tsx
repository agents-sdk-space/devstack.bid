"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (!s) {
    s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }
  return new Promise((resolve, reject) => {
    s!.addEventListener("load", () => resolve(), { once: true });
    s!.addEventListener("error", () => reject(new Error("turnstile script failed")), { once: true });
  });
}

/**
 * Cloudflare Turnstile widget (explicit render). It adds the hidden `cf-turnstile-response` input to
 * the surrounding form. Tokens are single-use: the widget is reset when the page is restored from
 * the back/forward cache, so a retry always carries a fresh token.
 */
export function TurnstileWidget({ siteKey, action, lang, onToken }: { siteKey: string; action: string; lang: string; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tokenCb = useRef(onToken);
  useEffect(() => {
    tokenCb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          size: "flexible",
          language: lang === "th" ? "th" : "en",
          appearance: "always",
          callback: (t: string) => tokenCb.current(t),
          "expired-callback": () => tokenCb.current(null),
          "error-callback": () => tokenCb.current(null),
        });
      })
      .catch(() => tokenCb.current(null));
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && id && window.turnstile) {
        tokenCb.current(null);
        window.turnstile.reset(id);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onShow);
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, action, lang]);

  return <div ref={box} data-testid="turnstile" className="min-h-[65px] w-full" />;
}
