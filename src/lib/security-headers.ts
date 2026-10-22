/**
 * Security headers applied to every route (next.config.ts) — and mirrored for static assets in
 * public/_headers. The CSP allows 'unsafe-inline' scripts because the app is statically
 * prerendered (Next's inline bootstrap + our pre-paint theme script cannot carry per-request nonces);
 * everything else is locked to the app's own origin, plus GitHub and Google profile images.
 */
export function contentSecurityPolicy(dev = false): string {
  return [
    "default-src 'self'",
    // Cloudflare Web Analytics is injected on the devstack.bid zone (beacon script + RUM endpoint).
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self' https://cloudflareinsights.com${dev ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // "Open in CodeSandbox" on the home live example posts the visitor's files to codesandbox.io.
    "form-action 'self' https://codesandbox.io",
    "frame-ancestors 'none'",
    // Home live example (Sandpack, Apache-2.0): its bundler runs in a cross-origin
    // *.codesandbox.io iframe in the visitor's browser. The only third-party frame we allow.
    // Cloudflare Turnstile widget on /login (script + challenge iframe).
    // AI chat builder preview: user sites on *.devstack.bid (separate origin, sandboxed iframe; never the apex).
    "frame-src https://*.codesandbox.io https://challenges.cloudflare.com https://*.devstack.bid",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/** CSP for /api/github/app/manifest only: the page's form posts the App manifest to github.com. No scripts. */
export function githubManifestContentSecurityPolicy(dev = false): string {
  return contentSecurityPolicy(dev)
    .split("; ")
    .map((d) => (d.startsWith("form-action ") ? "form-action https://github.com" : d.startsWith("script-src ") ? "script-src 'none'" : d))
    .join("; ");
}

/**
 * CSP for the internal /ui-lab preview only (noindex, not linked). Same as the site CSP plus what
 * the Spline 3D runtime needs: the scene file (prod.spline.design), its WASM/JS helpers
 * (cdn.spline.design, unpkg fallback, Google's Draco decoder) and 'wasm-unsafe-eval'.
 * Scoped to that one route in next.config.ts so the rest of the site keeps the strict policy.
 */
export function uiLabContentSecurityPolicy(dev = false): string {
  const spline = "https://prod.spline.design https://cdn.spline.design https://unpkg.com https://www.gstatic.com";
  return contentSecurityPolicy(dev)
    .split("; ")
    .map((d) => {
      if (d.startsWith("script-src ")) return `${d} 'wasm-unsafe-eval' ${spline}`;
      if (d.startsWith("connect-src ")) return `${d} ${spline}`;
      if (d.startsWith("font-src ")) return `${d} https://fonts.gstatic.com`;
      return d;
    })
    .join("; ");
}

/**
 * CSP for /studio (the merged DEVSTACK workspace). The Studio is served from static assets, so the
 * policy lives in public/_headers (block `/studio/*`, together with COOP/COEP); this function is the
 * tested source of truth for that line (tests/studio.test.ts). Differences from the site CSP:
 * 'wasm-unsafe-eval' (PGlite compiles Postgres WASM) and frame-src 'self' for the static preview
 * page (/studio/preview/). No third-party frames, no 'unsafe-inline' scripts: the Vite build has none.
 */
export function studioContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/**
 * CSP for the static preview host page /studio/preview/* (block `/studio/preview/*` in
 * public/_headers, which detaches the Studio CSP and X-Frame-Options first). The page is loaded in
 * <iframe sandbox="allow-scripts allow-forms allow-modals"> (opaque origin) and runs the user's
 * generated app, so it may evaluate code but cannot load or send anything: no network at all,
 * only inline/data resources, and only the Studio may frame it.
 */
export function studioPreviewContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/**
 * Cross-origin isolation for /studio only. Not strictly required any more (the WebContainers
 * sandbox that needed SharedArrayBuffer was removed in 0.8.0-rc.2); kept so the Studio stays an
 * isolated browsing context group with no cross-origin subresources.
 */
export const STUDIO_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
} as const;

export const HSTS = "max-age=31536000";

export function securityHeaders(dev = false): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
  // HSTS only makes sense over HTTPS; browsers ignore it on http://localhost anyway.
  // No includeSubDomains/preload: the app is served on the zone apex (devstack.bid), where
  // includeSubDomains would force HTTPS on every future subdomain of the zone. Add it back only
  // once all subdomains are known to serve HTTPS (see docs/operations/custom-domain.md).
  if (!dev) headers.push({ key: "Strict-Transport-Security", value: HSTS });
  return headers;
}
