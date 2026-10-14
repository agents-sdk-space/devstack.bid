import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Regression check for the rest of devstack.bid after the Studio merge: every page still loads with
 * its own CSP, no COEP, no console errors / CSP violations, no horizontal scroll, and the header
 * links to /studio/ as a full-page navigation. Screenshots go to screenshots/v0.8/.
 */
const SHOTS = process.env.STUDIO_SHOTS_DIR ?? new URL('../../screenshots/v0.8', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const PAGES = ['/', '/templates', '/builder', '/chat', '/chat/dev', '/factory', '/docs', '/docs/user-guide/studio', '/docs/architecture/studio', '/design'];

for (const width of [1440, 390]) {
  for (const lang of ['en', 'th'] as const) {
    test(`site pages @${width}px ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((l) => {
        localStorage.setItem('nvx-lang', l);
        document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
      }, lang);
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()}: ${m.text()}`));
      page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
      for (const path of PAGES) {
        const res = await page.goto(path, { waitUntil: 'networkidle' });
        expect(res?.status(), path).toBe(200);
        const h = res!.headers();
        expect(h['cross-origin-embedder-policy'], `${path} must not be cross-origin isolated`).toBeUndefined();
        expect(h['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} horizontal scroll`).toBe(true);
        if (width === 1440 && lang === 'en' && ['/', '/docs/user-guide/studio', '/chat'].includes(path)) {
          const name = path === '/' ? 'home' : path.slice(1).replace(/\//g, '-');
          await page.screenshot({ path: `${SHOTS}/site-${name}-1440.png` });
        }
      }
      // Pre-existing on main (not caused by the Studio merge): zod v4 probes `Function("")` once inside
      // try/catch to decide whether it may JIT. The site CSP blocks it, the probe falls back, nothing breaks,
      // but Chrome still reports a violation. Fix separately with `z.config({ jitless: true })` in client code.
      const KNOWN_PREEXISTING = /\/builder: CSP violation: script-src eval\s*$/;
      expect(errors.filter((e) => !KNOWN_PREEXISTING.test(e))).toEqual([]);
    });
  }
}

test('header links to the Studio as a document and back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const link = page.locator('nav[aria-label="Main"] a[href="/studio/"]');
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL('**/studio/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByTestId('agent-chat')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/nav-01-studio-from-header.png` });
  await page.getByRole('link', { name: 'NVX Stack Builder home' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${SHOTS}/nav-02-header-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 60 } });
});

test('unknown template is a 404 and /studio redirects to /studio/', async ({ request }) => {
  expect((await request.get('/templates/unknown')).status()).toBe(404);
  const r = await request.get('/studio', { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(r.status());
  expect(r.headers()['location']).toMatch(/\/studio\/$/);
});
