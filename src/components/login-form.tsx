"use client";

import { buttonClasses, Field, Input } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";
import { useLang } from "./prefs";

const PROVIDERS = [
  { id: "cursor", href: "cursor", label: "auth.withCursor" },
  { id: "google", href: "google", label: "auth.withGoogle" },
  { id: "github", href: "github", label: "auth.withGithub" },
] as const;

function notice(auth: string, provider: string): { title: DictKey; body: DictKey } | null {
  if (auth === "missing") {
    const body: DictKey =
      provider === "cursor" ? "auth.missing.cursor" : provider === "google" ? "auth.missing.google" : provider === "password" ? "auth.missing.password" : "auth.missing.github";
    return { title: "auth.missingTitle", body };
  }
  if (auth === "error") return { title: "auth.errorTitle", body: "auth.error" };
  if (auth === "denied") return { title: "auth.deniedTitle", body: "auth.denied" };
  if (auth === "invalid") return { title: "auth.invalidTitle", body: "auth.invalid" };
  if (auth === "taken") return { title: "auth.takenTitle", body: "auth.taken" };
  if (auth === "weak") return { title: "auth.weakTitle", body: "auth.weak" };
  return null;
}

/** Four sign-in methods: Cursor, Google, GitHub, and a DevStack email account. */
export function LoginForm({ next, auth, provider }: { next: string; auth: string; provider: string }) {
  const { t } = useLang();
  const alert = notice(auth, provider);
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">{t("auth.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-subtle">{t("auth.lead")}</p>
      <p className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed text-fg" role="status">
        {t("announce.cursor")}
      </p>
      {alert && (
        <div role="alert" className="mt-6 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-sm font-medium text-fg">{t(alert.title)}</p>
          <p className="mt-1 text-sm leading-relaxed text-subtle">{t(alert.body)}</p>
        </div>
      )}
      <div className="mt-6 space-y-2">
        {PROVIDERS.map((item) => (
          <a key={item.id} href={`/api/auth/${item.href}?next=${encodeURIComponent(next)}`} className={buttonClasses("secondary", "md", "w-full justify-start px-4")}>
            <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-fg">
              {item.id === "github" ? "GH" : item.id.slice(0, 1).toUpperCase()}
            </span>
            {t(item.label)}
          </a>
        ))}
      </div>
      <form method="post" action="/api/auth/password" className="mt-8 space-y-4 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-fg">{t("auth.ownHeading")}</h2>
        <input type="hidden" name="next" value={next} />
        <Field label={t("auth.email")}>
          {(props) => <Input {...props} name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={200} />}
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          {(props) => <Input {...props} name="password" type="password" autoComplete="current-password" required minLength={10} maxLength={200} />}
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" name="action" value="login" className={buttonClasses("primary", "md", "w-full")}>
            {t("auth.signIn")}
          </button>
          <button type="submit" name="action" value="register" className={buttonClasses("outline", "md", "w-full")}>
            {t("auth.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
