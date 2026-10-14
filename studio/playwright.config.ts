import { defineConfig, devices } from '@playwright/test';

/**
 * Studio end-to-end tests run against a devstack.bid build that is already serving, e.g.
 *   npm run preview            (in the repo root, http://localhost:8787)
 * The Studio is a static sub-app of the Worker, so there is no separate web server to start here.
 * Without Workers AI / HF the server reports llm:false and the agents use their mock providers.
 */
const BASE = process.env.STUDIO_BASE_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  testDir: 'e2e',
  timeout: 12 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: BASE,
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
});
