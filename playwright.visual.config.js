// @ts-check
// Visual regression: every page at four widths in Day and Dusk, compared with committed screenshots.
//   npm run test:visual            compare
//   npm run test:visual:update     accept the current look as the new baseline (after an intended design change)
// Baselines are rendered by Google Chrome on macOS; regenerate them on another OS or Chrome major version.
const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');

const PORT = 8778;

module.exports = defineConfig({
  testDir: './tests/visual',
  timeout: 90_000,
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixels: 2500, threshold: 0.15, animations: 'disabled', caret: 'hide' } },
  workers: 2,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL || 'chrome',
    reducedMotion: 'reduce',          // no reveals, parallax, curtain or counters mid-flight: the page is at rest
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'python3 server.py',
    url: `http://127.0.0.1:${PORT}/api/status`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), GO_DB_PATH: path.join(os.tmpdir(), `go-visual-${process.pid}.sqlite3`) },
  },
});
