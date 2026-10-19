"use client";

import type { ReactNode } from "react";
import { Card, Segmented } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";
import { PREF_OPTIONS, type PrefKey, type Prefs } from "@/lib/prefs";
import { useAccount } from "../account-button";
import { useLang, usePrefs, useSyncState } from "../prefs";

/** One label per option value. Typed so a missing translation key fails the type check. */
const LABELS: { [K in PrefKey]: Record<(typeof PREF_OPTIONS)[K][number], DictKey> } = {
  theme: { system: "settings.theme.system", light: "settings.theme.light", dark: "settings.theme.dark" },
  lang: { th: "settings.lang.th", en: "settings.lang.en" },
  chatFont: { default: "settings.chatFont.default", thai: "settings.chatFont.thai", mono: "settings.chatFont.mono" },
  chatSize: { small: "settings.chatSize.small", medium: "settings.chatSize.medium", large: "settings.chatSize.large" },
  chatWidth: { narrow: "settings.chatWidth.narrow", medium: "settings.chatWidth.medium", wide: "settings.chatWidth.wide" },
  motion: { system: "settings.motion.system", reduced: "settings.motion.reduced" },
};

const TITLES: Record<PrefKey, DictKey> = {
  theme: "settings.theme",
  lang: "settings.lang",
  chatFont: "settings.chatFont",
  chatSize: "settings.chatSize",
  chatWidth: "settings.chatWidth",
  motion: "settings.motion",
};

const HINTS: Partial<Record<PrefKey, DictKey>> = {
  theme: "settings.theme.hint",
  chatWidth: "settings.chatWidth.hint",
  motion: "settings.motion.hint",
};

function Row({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      {children}
      {hint && <p className="mt-1.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

/**
 * /settings: general preferences. Every control writes through setPref() (src/components/prefs.tsx), so the
 * change is applied to the page at once, stored in this browser and, for signed-in users, synced to the account.
 */
export function GeneralSettings() {
  const { prefs, set } = usePrefs();
  const { t } = useLang();
  const account = useAccount();
  const sync = useSyncState();

  function field(key: PrefKey) {
    const labels = LABELS[key] as Record<string, DictKey>;
    const options = (PREF_OPTIONS[key] as readonly string[]).map((value) => ({ value, label: t(labels[value]) }));
    const hint = HINTS[key];
    return (
      <Row hint={hint ? t(hint) : undefined}>
        <Segmented<string> legend={t(TITLES[key])} value={prefs[key]} options={options} onChange={(value) => set(key, value as Prefs[PrefKey])} />
      </Row>
    );
  }

  const status = !account ? t("settings.sync.guest") : sync === "syncing" ? t("settings.sync.syncing") : sync === "synced" ? t("settings.sync.synced") : sync === "error" ? t("settings.sync.error") : t("settings.sync.local");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{t("settings.general.title")}</h1>
      <p className="mt-1 text-sm text-subtle">{t("settings.general.desc")}</p>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-subtle">
        {status}
        {!account && (
          <>
            {" "}
            <a href="/login?next=/settings" className="underline underline-offset-4 hover:text-fg">
              {t("auth.signIn")}
            </a>
          </>
        )}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <Card className="p-5">
          {field("theme")}
          {field("lang")}
          {field("chatFont")}
          {field("chatSize")}
          {field("chatWidth")}
          {field("motion")}
        </Card>

        <Card as="section" aria-labelledby="settings-preview" className="overflow-hidden p-5 lg:sticky lg:top-20">
          <h2 id="settings-preview" className="text-sm font-semibold text-fg">
            {t("settings.preview.title")}
          </h2>
          <div className="chat-text mt-3 space-y-4 break-words" data-testid="chat-preview">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 leading-relaxed">{t("settings.preview.user")}</div>
            </div>
            <p className="leading-relaxed text-fg">{t("settings.preview.agent")}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

