import { mkdirSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test, type Frame, type Page } from '@playwright/test';

const SHOTS = process.env.STUDIO_SHOTS_DIR ?? new URL('../../screenshots/v0.8', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

async function previewFrame(page: Page): Promise<Frame> {
  await expect(page.getByTestId('preview-iframe')).toBeVisible({ timeout: 6 * 60_000 });
  const handle = await page.getByTestId('preview-iframe').elementHandle();
  const frame = await handle!.contentFrame();
  expect(frame).not.toBeNull();
  return frame!;
}

test('build a todo app: code, sandbox preview, DB, vectors, image, export', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
    );
  });

  await page.goto('/studio/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByTestId('studio-signature')).toBeVisible();
  await expect(page.locator('[data-testid=nvx-mascot]').first()).toBeVisible();

  const health = await (await page.request.get('/api/studio/health')).json();
  // Never expose credentials to the browser: health only reports booleans/names.
  expect(JSON.stringify(health)).not.toMatch(/key|secret|token/i);

  await expect(page.getByTestId('status-chips')).toContainText(/PGlite|pgvector/i);
  await expect(page.getByTestId('sandbox-phase')).toHaveText('ready', { timeout: 6 * 60_000 });
  await page.screenshot({ path: `${SHOTS}/studio-01-ready.png` });

  // --- prompt ---
  await page.getByTestId('prompt-input').fill('build a todo app');
  await page.getByTestId('prompt-submit').click();
  const chat = page.getByTestId('chat-messages');
  await expect(chat).toContainText(/CodeAgent \((llm|template)\) →/, { timeout: 6 * 60_000 });
  await expect(page.getByTestId('thinking-indicator')).toHaveAttribute('data-active', 'false', { timeout: 6 * 60_000 });
  await expect(chat).toContainText(/DBAgent \((llm|template)\) → tables:/);
  await expect(chat).toContainText(/DesignAgent \(\w+\) → public\/assets\//);
  const summary = await chat.locator('[data-role=assistant]').last().innerText();
  console.log('[e2e] orchestrator summary:', summary.replace(/\s+/g, ' ').slice(0, 400));

  // --- files in the editor ---
  const files = page.getByTestId('file-list');
  await expect(files.locator('[data-path="src/App.jsx"]')).toBeVisible();
  await files.locator('[data-path="src/App.jsx"]').click();
  await expect(page.getByTestId('active-file')).toHaveText('src/App.jsx');
  await expect(page.locator('[data-testid=editor-panel] .monaco-editor')).toBeVisible();
  await expect(page.locator('[data-testid=editor-panel] .view-lines')).toContainText(/useState|function|export/);

  // --- image written to public/assets ---
  const assetFile = files.locator('[data-path^="public/assets/"][data-path$=".png"]').first();
  await expect(assetFile).toBeVisible();
  const assetPath = await assetFile.getAttribute('data-path');
  await expect(page.getByTestId('asset-list').locator(`[data-path="${assetPath}"]`)).toBeVisible();
  const imgOk = await page
    .getByTestId('asset-list')
    .locator(`[data-path="${assetPath}"] img`)
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(imgOk).toBe(true);

  // --- live preview inside WebContainer ---
  await expect(page.getByTestId('sandbox-phase')).toHaveText('ready', { timeout: 6 * 60_000 });
  await expect
    .poll(
      async () => {
        const frame = await previewFrame(page);
        return (await frame.locator('body').innerText().catch(() => '')).trim();
      },
      { timeout: 5 * 60_000, intervals: [2000] },
    )
    .toMatch(/todo|task/i);
  const frame = await previewFrame(page);
  await expect(frame.locator('input').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/studio-02-todo-app-built.png` });

  // --- Data Inspector ---
  const tables = page.getByTestId('table-list');
  const appTable = tables.locator('[data-table]').filter({ hasText: /todo|task/i }).first();
  await expect(appTable).toBeVisible();
  await appTable.click();
  await page.getByTestId('inspector-tab-grid').click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
  await expect(page.getByTestId('data-grid').locator('th').first()).toBeVisible();
  await page.getByTestId('inspector-tab-schema').click();
  await expect(page.getByTestId('schema-topology')).toContainText(/todo|task/i);

  // --- vector search ---
  await page.getByTestId('inspector-tab-vector').click();
  await page.getByTestId('vector-query').fill('todo items table');
  await page.getByTestId('vector-search').click();
  const distances = page.getByTestId('vector-distance');
  await expect(distances.first()).toBeVisible();
  const values = (await distances.allInnerTexts()).map((t) => Number(t.trim()));
  expect(values.length).toBeGreaterThan(0);
  for (const v of values) expect(Number.isFinite(v) && v >= 0 && v <= 2).toBe(true);
  expect([...values].sort((a, b) => a - b)).toEqual(values);
  await page.screenshot({ path: `${SHOTS}/studio-03-data-inspector.png` });

  // --- export ---
  await page.getByTestId('deploy-export').click();
  await expect(page.getByTestId('export-modal')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()]);
  expect(download.suggestedFilename()).toBe('devstack-export.zip');
  await expect(page.getByTestId('export-manifest')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/studio-04-export.png` });

  const zipPath = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const names = Object.keys(zip.files);
  for (const required of [
    'package.json',
    'src/App.jsx',
    'src/main.jsx',
    'index.html',
    'db/migrations/001_init.sql',
    'db/schema.prisma',
    'vercel.json',
    'wrangler.toml',
    'Dockerfile',
    '.env.example',
    'README.md',
    assetPath!,
  ]) {
    expect(names, `zip contains ${required}`).toContain(required);
  }
  expect(names.some((n) => n.startsWith('node_modules/'))).toBe(false);
  const sql = await zip.file('db/migrations/001_init.sql')!.async('string');
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "\w*(todo|task)\w*"/i);
  const prisma = await zip.file('db/schema.prisma')!.async('string');
  expect(prisma).toMatch(/model \w+ \{/);
  const png = await zip.file(assetPath!)!.async('uint8array');
  expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

  // Thai UI (language shared with the rest of devstack.bid via localStorage nvx-lang).
  await page.getByTestId('export-modal').getByRole('button', { name: /^(Close|ปิด)$/ }).first().click();
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByTestId('prompt-submit')).toHaveText('รัน');
  await page.screenshot({ path: `${SHOTS}/studio-05-thai.png` });
  await page.getByTestId('lang-toggle').click();

  expect(pageErrors).toEqual([]);
  console.log('[e2e] console errors:', JSON.stringify(consoleErrors));
  expect(consoleErrors.filter((e) => /CSP violation|Refused to/.test(e))).toEqual([]);
});
