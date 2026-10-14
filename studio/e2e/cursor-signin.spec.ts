import { expect, type Page, test } from '@playwright/test';

/**
 * Production smoke for Cursor sign-in. Run against the live site:
 *   CURSOR_SIGNIN_E2E=1 STUDIO_BASE_URL=https://devstack.bid npm run studio:e2e -- e2e/cursor-signin.spec.ts
 * Preview builds have no Origin app id, so the spec stays out of the local suite.
 *
 * A signed-out browser is sent from DevStack to the Origin install URL, then to
 * Cursor's own account login. Origin checks the redirect allowlist after that
 * login. This run proves the install URL carries the registered callback and that
 * Cursor does not stop on "redirect_uri is not allowed".
 */
const APP_ID = 'app_01m4xk8788f7s941zg4cpjxcer';
const REDIRECT = 'https://devstack.bid/api/auth/cursor/callback';

test.skip(!process.env.CURSOR_SIGNIN_E2E, 'set CURSOR_SIGNIN_E2E=1 to smoke the live Cursor sign-in');
test.describe.configure({ timeout: 60_000 });

function installFrom(urls: string[]): URL | undefined {
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.hostname === 'cursor.com' && url.pathname.startsWith('/codebase/apps/install')) return url;
    const forwarded = url.searchParams.get('redirect_uri');
    if (!forwarded) continue;
    try {
      const inner = new URL(forwarded);
      if (inner.hostname === 'cursor.com' && inner.pathname.startsWith('/codebase/apps/install')) return inner;
    } catch {
      /* not an absolute install URL */
    }
  }
  return undefined;
}

async function leaveForCursor(page: Page, linkName: string) {
  const seen: string[] = [];
  page.on('response', (res) => {
    seen.push(res.url());
    const loc = res.headers()['location'];
    if (loc) seen.push(new URL(loc, res.url()).toString());
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.push(frame.url());
  });
  await page.getByRole('link', { name: linkName }).click();
  await page.waitForURL((url) => url.hostname === 'cursor.com' || url.hostname.endsWith('cursor.sh'), {
    timeout: 20_000,
    waitUntil: 'commit',
  });
  seen.push(page.url());
  const install = installFrom(seen);
  expect(install, 'Cursor install URL in the navigation').toBeTruthy();
  expect(install!.searchParams.get('client_id')).toBe(APP_ID);
  expect(install!.searchParams.get('redirect_uri')).toBe(REDIRECT);
  expect(install!.searchParams.get('scope')).toBe('repository:metadata:read');
  await expect(page.getByText('redirect_uri is not allowed')).toHaveCount(0);
  expect(page.url()).not.toContain('redirect_uri%20is%20not%20allowed');
}

test('Cursor sign-in leaves DevStack for the registered install callback', async ({ page, request }) => {
  const start = await request.get('/api/auth/cursor', { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  expect(start.headers()['cache-control']).toContain('no-store');
  const location = start.headers()['location'] ?? '';
  const install = new URL(location);
  expect(`${install.origin}${install.pathname}`).toBe('https://cursor.com/codebase/apps/install');
  expect(install.searchParams.get('client_id')).toBe(APP_ID);
  expect(install.searchParams.get('redirect_uri')).toBe(REDIRECT);
  expect(install.searchParams.get('scope')).toBe('repository:metadata:read');
  expect(install.searchParams.get('summary')).toBe('Sign in to DevStack');
  expect(install.searchParams.get('state')).toBeTruthy();

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await leaveForCursor(page, 'Continue with Cursor');

  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('a[href="/login?next=/chat"]').first()).toBeVisible();
});

test('Thai login still starts the same Cursor install', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nvx-lang', 'th'));
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await leaveForCursor(page, 'เข้าสู่ระบบด้วย Cursor');
});
