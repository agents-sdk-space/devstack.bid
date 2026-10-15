"use client";

import { useState } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui";
import { useLang } from "./prefs";

export const CONSENT_KEY = "nvx-cookie-consent";
export type Consent = { necessary: true; analytics: boolean; updatedAt: string };

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return { necessary: true, analytics: v?.analytics === true, updatedAt: String(v?.updatedAt ?? "") };
  } catch {
    return null;
  }
}

function saveConsent(analytics: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, analytics, updatedAt: new Date().toISOString() }));
  } catch {}
}

/** Privacy-choices pill: our own monochrome drawing (check + x), uses currentColor. */
export function PrivacyChoicesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 14" className={className} aria-hidden="true" focusable="false">
      <rect x="0.75" y="0.75" width="28.5" height="12.5" rx="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 0.75h7.75a6.25 6.25 0 0 1 0 12.5H11z" fill="currentColor" />
      <path d="M5.5 7.2l2 2 3.6-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 4.5l5 5m0-5l-5 5" fill="none" style={{ stroke: "var(--color-bg)" }} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CookiePreferences() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setAnalytics(readConsent()?.analytics ?? false);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="focus-ring inline-flex items-center gap-1.5 rounded-sm hover:text-fg">
          <PrivacyChoicesIcon className="h-3.5 w-auto" />
          {t("footer.cookies")}
        </button>
      </DialogTrigger>
      <DialogContent title={t("footer.cookies")} description={t("cookies.body")} closeLabel={t("nav.close")}>
        <div className="mt-4 space-y-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <label htmlFor="cookie-necessary">
              <span className="block font-medium text-fg">{t("cookies.necessary")}</span>
              <span className="block text-muted">{t("cookies.necessaryBody")}</span>
            </label>
            <input id="cookie-necessary" type="checkbox" checked disabled className="mt-1 h-4 w-4 accent-current" />
          </div>
          <div className="flex items-start justify-between gap-4">
            <label htmlFor="cookie-analytics">
              <span className="block font-medium text-fg">{t("cookies.analytics")}</span>
              <span className="block text-muted">{t("cookies.analyticsBody")}</span>
            </label>
            <input id="cookie-analytics" type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="focus-ring mt-1 h-4 w-4 accent-current" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" size="sm" onClick={() => saveConsent(false)}>{t("cookies.necessaryOnly")}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button size="sm" onClick={() => saveConsent(analytics)}>{t("cookies.save")}</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
