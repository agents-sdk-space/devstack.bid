"use client";

import React, { useContext, useEffect, useMemo, useState } from "react";
import { StatsigClient, StatsigContext } from "@statsig/react-bindings";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";

// Public client key (safe to ship to the browser). Override with NEXT_PUBLIC_STATSIG_CLIENT_KEY.
const STATSIG_CLIENT_KEY =
  process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY || "client-QlR7LftVHOC43UqakDi50eSUXEjUfTCL5Di0ZkfBGc6";

const ANON_KEY = "nvx-statsig-anon-id";

/** Stable anonymous id kept in localStorage so the same browser maps to the same Statsig user. */
function anonymousId(): string {
  if (typeof window === "undefined") return "anonymous";
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      id = `anon-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

function StatsigInner({ sdkKey, children }: { sdkKey: string; children: React.ReactNode }) {
  // Outside any provider this is the SDK's no-op default client, used during SSR/prerender and
  // until the real client exists. The provider element is always rendered, so the tree shape
  // never changes and children are not remounted when Statsig becomes ready.
  const fallback = useContext(StatsigContext);
  const [client, setClient] = useState<StatsigClient | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);

  // Browser only: the client (stable ids, network, rrweb) is never created on the server, so
  // prerendering stays deterministic and SSR/SEO output is unchanged.
  useEffect(() => {
    let cancelled = false;
    let c: StatsigClient;
    try {
      c = new StatsigClient(
        sdkKey,
        { userID: anonymousId() },
        {
          plugins: [
            new StatsigAutoCapturePlugin(),
            // Never record what people type (passwords, API keys, secrets): mask all inputs.
            new StatsigSessionReplayPlugin({
              rrwebConfig: { maskAllInputs: true, maskInputOptions: { password: true } },
            }),
          ],
        },
      );
    } catch {
      return;
    }
    const bump = () => setRenderVersion((v) => v + 1);
    c.$on("values_updated", bump);
    queueMicrotask(() => {
      if (!cancelled) setClient(c);
    });
    void c.initializeAsync().catch(() => {}).finally(bump);

    // Swap to the real signed-in user id once the session is known.
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ account?: { login?: string; provider?: string } | null }>) : null))
      .then((data) => {
        const acc = data?.account;
        if (cancelled || !acc?.login) return;
        void c
          .updateUserAsync({
            userID: `${acc.provider ?? "user"}:${acc.login}`,
            customIDs: { anonymousID: anonymousId() },
            custom: { provider: acc.provider ?? "unknown" },
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      c.off("values_updated", bump);
      void c.shutdown().catch(() => {});
    };
  }, [sdkKey]);

  const value = useMemo(
    () => ({
      client: client ?? fallback.client,
      isLoading: !client || client.loadingStatus !== "Ready",
      renderVersion,
    }),
    [client, fallback.client, renderVersion],
  );

  // No "Loading..." gate: children always render immediately.
  return <StatsigContext.Provider value={value}>{children}</StatsigContext.Provider>;
}

export default function MyStatsig({ children }: { children: React.ReactNode }) {
  // Missing key: render the app without Statsig instead of crashing.
  if (!STATSIG_CLIENT_KEY.startsWith("client-")) return <>{children}</>;
  return <StatsigInner sdkKey={STATSIG_CLIENT_KEY}>{children}</StatsigInner>;
}
