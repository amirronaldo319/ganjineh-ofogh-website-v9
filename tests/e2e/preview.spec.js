// @ts-check
const { test, expect } = require('@playwright/test');

// The e2e server accepts enquiries, so the preview notices should correct themselves away there. These tests make the
// backend look absent (as on a static host) and check what a visitor sees.
async function staticHost(page) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
}

test('on a static preview, the buttons say plainly that requests are not sent yet', async ({ page }) => {
  await staticHost(page);
  await page.goto('/index.html');
  await expect(page.locator('.hero .preview-hint')).toBeVisible();
  await expect(page.locator('.hero .preview-hint')).toContainText('پیش‌نمایش');
  await page.goto('/en/residence-2.html');
  await expect(page.locator('.phero .preview-hint')).toContainText('Preview: enquiry forms open at launch');
  await page.goto('/en/index.html');
  await expect(page.locator('.visit .preview-hint')).toBeAttached();
});

test('the contact and brochure pages explain it before the form, and the form stays closed', async ({ page }) => {
  await staticHost(page);
  for (const url of ['/en/contact.html', '/en/brochure.html']) {
    await page.goto(url);
    await expect(page.locator('.preview-note')).toBeVisible();
    await expect(page.locator('.preview-note')).toContainText('This is a preview');
    await expect(page.locator('[data-submit-label]')).toBeDisabled();
  }
});

test('requests go to the backend next to the site, keeping any path prefix', async ({ page }) => {
  const seen = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) seen.push(new URL(r.url()).pathname); });
  await page.goto('/en/contact.html');
  await page.waitForFunction(() => !!window.ofogh);
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen.every((p) => p === '/api/status')).toBe(true);
  // from /en/ the helper resolves relative to the site root, not to the host root
  expect(await page.evaluate(() => new URL(window.ofogh.api('status'), location.href).pathname)).toBe('/api/status');
});

test('with a working backend the notices disappear by themselves', async ({ page }) => {
  await page.goto('/en/contact.html');          // the e2e server accepts requests
  await expect(page.locator('.preview-note')).toBeHidden();
  await page.goto('/index.html');
  await expect(page.locator('.hero .preview-hint')).toBeHidden();
});

test('when an email address is configured, a closed form offers an email draft', async ({ page }) => {
  await staticHost(page);
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const m = document.createElement('meta'); m.name = 'go-mail'; m.content = 'sales@example.com'; document.head.appendChild(m);
    });
  });
  await page.goto('/en/contact.html');
  await page.locator('#name').fill('Test Visitor');
  await page.locator('#mobile').fill('09121234567');
  const link = page.locator('[data-mail-fallback]');
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^mailto:sales@example\.com\?subject=/);
  expect(decodeURIComponent(href)).toContain('Test Visitor');
});
