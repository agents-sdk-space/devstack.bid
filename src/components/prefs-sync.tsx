"use client";

import { useEffect } from "react";
import { sanitizePrefs } from "@/lib/prefs";
import { useAccount } from "./account-button";
import { applyRemotePrefs, readPrefsStamp, readStoredPrefs, setSyncState, subscribePrefChanges, writePrefsStamp } from "./prefs";

const PUSH_DELAY_MS = 1500;
const RETRY_DELAY_MS = 60_000;

/**
 * Keeps display preferences in step with the signed-in account (GET/PUT /api/preferences).
 * Guests never call the API: their values stay in this browser. On sign-in the newer side wins
 * (account copy vs. local copy, by timestamp); later local changes are pushed after a short pause.
 * If the API or table is unavailable the values simply stay local.
 */
export function PrefsSync() {
  const login = useAccount()?.login ?? null;

  useEffect(() => {
    if (!login) {
      setSyncState("local");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void push(), ms);
    };

    async function push() {
      if (cancelled) return;
      setSyncState("syncing");
      try {
        const res = await fetch("/api/preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prefs: readStoredPrefs() }),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { updatedAt?: unknown };
          if (typeof data.updatedAt === "number") writePrefsStamp(data.updatedAt);
          setSyncState("synced");
        } else if (res.status === 429) {
          setSyncState("error");
          schedule(RETRY_DELAY_MS);
        } else {
          setSyncState(res.status === 401 || res.status === 503 ? "local" : "error");
        }
      } catch {
        if (cancelled) return;
        setSyncState("error");
        schedule(RETRY_DELAY_MS);
      }
    }

    async function pull() {
      setSyncState("syncing");
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setSyncState(res.status === 401 || res.status === 503 ? "local" : "error");
          return;
        }
        const data = (await res.json()) as { prefs?: unknown; updatedAt?: unknown };
        if (cancelled) return;
        const remote = sanitizePrefs(data.prefs);
        const remoteAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
        const local = readStoredPrefs();
        const localAt = readPrefsStamp();
        const remoteHas = Object.keys(remote).length > 0;
        const localHas = Object.keys(local).length > 0;
        if (remoteHas && (!localHas || remoteAt > localAt)) {
          applyRemotePrefs(remote, remoteAt);
          setSyncState("synced");
        } else if (localHas && (!remoteHas || localAt > remoteAt)) {
          await push();
        } else {
          setSyncState("synced");
        }
      } catch {
        if (!cancelled) setSyncState("error");
      }
    }

    void pull();
    const off = subscribePrefChanges(() => schedule(PUSH_DELAY_MS));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      off();
    };
  }, [login]);

  return null;
}
