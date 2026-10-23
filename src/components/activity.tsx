"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { readConsent, saveConsent } from "./cookie-preferences";
import { useLang } from "./prefs";

const tracked = () => typeof document !== "undefined" && /(?:^|; )nvx_analytics=1/.test(document.cookie);
const gpc = () => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === "1";

export function track(type: "pageview" | "click", data: { path?: string; target?: string } = {}) {
  if (!tracked()) return;
  fetch("/api/activity/track", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", keepalive: true, body: JSON.stringify({ type, path: data.path ?? location.pathname, target: data.target }) }).catch(() => {});
}

/** Page views on route change, clicks on [data-track], and a one-time opt-in notice. Mounted once in the root layout. */
export function ActivityTracker() {
  const pathname = usePathname();
  const { lang } = useLang();
  const [ask, setAsk] = useState(false);
  useEffect(() => { track("pageview", { path: pathname }); }, [pathname]);
  useEffect(() => {
    // Older choices only lived in localStorage; mirror them into the cookie once.
    const c = readConsent();
    if (c && !/(?:^|; )nvx_analytics=/.test(document.cookie)) saveConsent(c.analytics);
    queueMicrotask(() => setAsk(!c && !gpc()));
    const onClick = (e: MouseEvent) => { const el = (e.target as HTMLElement | null)?.closest?.("[data-track]") as HTMLElement | null; if (el?.dataset.track) track("click", { target: el.dataset.track }); };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  if (!ask) return null;
  const th = lang === "th";
  const choose = (v: boolean) => { saveConsent(v); setAsk(false); if (v) track("pageview"); };
  return (
    <div role="dialog" aria-label={th ? "การใช้คุกกี้" : "Cookie notice"} className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-border bg-bg/95 p-4 shadow-lg backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <p className="text-sm font-medium text-fg">{th ? "ให้เราช่วยแนะนำสิ่งที่ตรงกับคุณไหม?" : "Personalise devstack.bid?"}</p>
      <p className="mt-1 text-xs text-muted">
        {th
          ? "ถ้าคุณอนุญาต เราจะนับหน้าที่เปิด ปุ่มหลักที่กด และหมวดหัวข้อแชต (ไม่เก็บข้อความที่พิมพ์) ด้วยรหัสสุ่ม เพื่อแนะนำเทมเพลตและเอกสาร ไม่มีโฆษณา ไม่ส่งให้บุคคลที่สาม"
          : "With your OK we count pages, main button clicks and chat topic categories (never what you type) with a random ID to suggest templates and docs. No ads, no third parties."}{" "}
        <Link href="/privacy" className="underline">{th ? "รายละเอียด" : "Details"}</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => choose(true)}>{th ? "อนุญาต" : "Allow"}</Button>
        <Button size="sm" variant="secondary" onClick={() => choose(false)}>{th ? "ไม่ใช่ตอนนี้" : "No thanks"}</Button>
      </div>
    </div>
  );
}

type Pick = { title: string; href: string; kind: string };
export function ForYou() {
  const { lang } = useLang();
  const [d, setD] = useState<{ personalized: boolean; interests: string[]; items: Pick[] } | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/activity/suggest", { credentials: "same-origin" }).then((r) => r.json()).then((j) => j?.ok && setD(j)).catch(() => {});
    load();
    window.addEventListener("nvx-consent", load);
    return () => window.removeEventListener("nvx-consent", load);
  }, []);
  if (!d?.items?.length) return null;
  const th = lang === "th";
  return (
    <section className="border-t border-border" aria-labelledby="for-you">
      <div className="mx-auto max-w-content px-4 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="for-you" className="text-lg font-semibold text-fg">{d.personalized ? (th ? "แนะนำสำหรับคุณ" : "Picked for you") : th ? "เริ่มต้น" : "Get started"}</h2>
          {d.personalized && <span className="text-xs text-muted">{th ? "จากการใช้งานล่าสุด: " : "Based on your recent visits: "}{d.interests.join(", ")}</span>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.items.map((it) => (
            <Link key={it.title} href={it.href} data-track="suggest" className="focus-ring flex items-center gap-3 rounded-lg border border-border p-3 text-sm text-fg transition hover:border-accent/60">
              <span>{it.title}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-subtle">{it.kind}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
