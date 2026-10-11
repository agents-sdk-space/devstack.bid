/**
 * Security headers applied to every route (next.config.ts) — and mirrored for static assets in
 * public/_headers. The CSP allows 'unsafe-inline' scripts because the app is statically
 * prerendered (Next's inline bootstrap + our pre-paint theme script cannot carry per-request nonces);
 * everything else is locked to the app's own origin.
 */
export function contentSecurityPolicy(dev = false): string {
  return [
    "default-src 'self'",
    // Cloudflare Web Analytics is injected on the devstack.bid zone (beacon script + RUM endpoint).
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://cloudflareinsights.com${dev ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/**
 * CSP for /studio (the merged DEVSTACK workspace). The Studio is served from static assets, so the
 * policy lives in public/_headers (block `/studio/*`, together with COOP/COEP); this function is the
 * tested source of truth for that line (tests/studio.test.ts). Differences from the site CSP:
 * 'wasm-unsafe-eval' (PGlite compiles Postgres WASM) and frame-src for the StackBlitz WebContainer
 * frames (Node sandbox + live preview). No 'unsafe-inline' scripts: the Vite build has none.
 */
export const STUDIO_FRAME_SOURCES = [
  "https://stackblitz.com",
  "https://*.stackblitz.com",
  "https://*.webcontainer-api.io",
  "https://*.webcontainer.io",
  "https://*.staticblitz.com",
];

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
    `frame-src ${STUDIO_FRAME_SOURCES.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/** Cross-origin isolation for /studio only (WebContainers need SharedArrayBuffer). */
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
