import { defineConfig, devices } from 'playwright/test';

// The suite runs against the production build served from a sub-path, the
// same way GitHub Pages serves a project site (https://<user>.github.io/<repo>/).
const PORT = 4321;
const BASE = '/three-x-vi/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}${BASE}`, trace: 'retain-on-failure' },
  webServer: {
    command: `node scripts/serve.mjs dist ${PORT}`,
    env: { BASE_PATH: BASE },
    url: `http://127.0.0.1:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
