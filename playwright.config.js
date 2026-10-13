// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');

const PORT = 8777;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // The 3D viewers evaluate ~2 MB of modules; under software WebGL that can take well over the default 5 s.
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  // Throwaway database with intake enabled so the enquiry flow runs end to end; never the project's var/.
  webServer: {
    command: 'python3 server.py',
    url: `http://127.0.0.1:${PORT}/api/status`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      GO_ACCEPT_ENQUIRIES: '1',
      GO_BROCHURE_PDF: path.join(__dirname, 'tests', 'fixtures', 'brochure-sample.pdf'),
      GO_DB_PATH: path.join(os.tmpdir(), `go-e2e-${process.pid}.sqlite3`),
    },
  },
  // WebKit is Safari's engine: desktop Safari and iPhone are the audience that matters most here.
  // PW_CHANNEL=chrome runs the Chrome projects on an installed Google Chrome (no browser download).
  projects: process.env.PW_CHROME_ONLY ? [
    { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chrome-android', use: { ...devices['Pixel 7'] } },
  ] : [
    { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'safari-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'safari-iphone', use: { ...devices['iPhone 13'] } },
    { name: 'chrome-android', use: { ...devices['Pixel 7'] } },
  ],
});
