// @ts-check
// Smoke test against the PUBLISHED site (no local server is started):
//   LIVE_URL=https://ganjineh-ofogh.pages.dev npx playwright test -c playwright.live.config.js
const { defineConfig, devices } = require('@playwright/test');

const LIVE_URL = (process.env.LIVE_URL || '').replace(/\/$/, '');
if (!LIVE_URL) throw new Error('Set LIVE_URL to the published address, e.g. LIVE_URL=https://ganjineh-ofogh.pages.dev');

module.exports = defineConfig({
  testDir: './tests/live',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: 1,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: LIVE_URL, trace: 'retain-on-failure', ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
