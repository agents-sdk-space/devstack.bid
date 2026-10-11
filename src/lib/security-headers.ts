/**
 * Security headers applied to every route (next.config.ts) — and mirrored for static assets in
 * public/_headers. The CSP allows 'unsafe-inline' scripts because the app is statically
 * prerendered (Next's inline bootstrap + our pre-paint theme script cannot carry per-request nonces);
 * everything else is locked to the app's own origin.
 */
export function contentSecurityPolicy(dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
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
