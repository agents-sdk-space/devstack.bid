"use client";

import { KeyRound, LogIn, LogOut } from "lucide-react";
import { useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui";
import type { DictKey } from "@/lib/i18n";
import { useLang } from "./prefs";
import type { ChatAccount } from "./chat/types";

let account: ChatAccount | null = null;
let loaded = false;
let pending = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!loaded && !pending) {
    pending = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ account?: ChatAccount | null }>) : { account: null }))
      .then((data) => {
        account = data.account?.login ? data.account : null;
      })
      .catch(() => {
        account = null;
      })
      .finally(() => {
        loaded = true;
        pending = false;
        emit();
      });
  }
  return () => listeners.delete(cb);
}

function snapshot() {
  return account;
}

function viaKey(provider: ChatAccount["provider"]): DictKey {
  if (provider === "cursor") return "auth.via.cursor";
  if (provider === "google") return "auth.via.google";
  if (provider === "password") return "auth.via.password";
  return "auth.via.github";
}

/** Header control: sign-in link, or the current account and a sign-out button. */
export function AccountButton({ next, full, onNavigate }: { next: string; full?: boolean; onNavigate?: () => void }) {
  const { t, lang } = useLang();
  const current = useSyncExternalStore(subscribe, snapshot, () => null);
  const href = `/login?next=${encodeURIComponent(next.startsWith("/login") ? "/" : next)}`;

  if (!current) {
    return (
      <a href={href} onClick={onNavigate} className={buttonClasses("secondary", "sm", full ? "w-full justify-start" : "px-2.5 sm:px-3.5")}>
        <LogIn className="h-4 w-4" aria-hidden />
        <span className={full ? "" : "max-[380px]:sr-only"}>{t("auth.signIn")}</span>
      </a>
    );
  }

  const logout = () => {
    onNavigate?.();
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.reload());
  };

  return (
    <div className={full ? "flex items-center gap-2" : "flex items-center gap-1"}>
      {current.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.avatarUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
      ) : null}
      <span className="max-w-[7rem] truncate text-[13px] font-medium text-fg" title={t(viaKey(current.provider))}>
        {current.login}
      </span>
      <a
        href="/settings/mcp"
        onClick={onNavigate}
        className={buttonClasses("ghost", "sm", "px-2.5")}
        aria-label={lang === "th" ? "ตั้งค่า MCP integrations" : "MCP integrations settings"}
        title={lang === "th" ? "ตั้งค่า MCP" : "MCP settings"}
      >
        <KeyRound className="h-4 w-4" aria-hidden />
        {full ? <span>MCP</span> : <span className="sr-only">MCP</span>}
      </a>
      <button type="button" onClick={logout} className={buttonClasses("ghost", "sm", "px-2.5")} aria-label={t("auth.logout")}>
        <LogOut className="h-4 w-4" aria-hidden />
        {full ? <span>{t("auth.logout")}</span> : <span className="sr-only">{t("auth.logout")}</span>}
      </button>
    </div>
  );
}
