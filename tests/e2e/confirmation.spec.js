// @ts-check
const { test, expect } = require('@playwright/test');

// One real enquiry per project run keeps us well under the server's 10-per-hour intake limit.
test.describe.configure({ mode: 'serial' });

let reference = '';

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const response = await api.post('/api/enquiries', {
    data: { route: 'advisor', name: 'E2E Visitor', mobile: '09120000000', consent: 'yes', 'residence-interest': 'residence-3' },
  });
  expect(response.status()).toBe(201);
  reference = (await response.json()).reference;
  await api.dispose();
});

const statusOf = (page) => page.locator('[data-confirmation]');

test('verified reference shows success and the code, in Persian then English', async ({ page }) => {
  await page.goto(`/thank-you.html?ref=${reference}`);
  await expect(statusOf(page)).toHaveAttribute('data-status', 'verified');
  await expect(page.getByRole('heading', { level: 1, name: 'درخواست شما دریافت شد' })).toBeVisible();
  await expect(page.locator('[data-state="verified"] [data-ref-value]')).toHaveText(reference);
  await page.waitForFunction(() => !!window.ofogh);
  await page.locator('#lang-btn').click();
  await expect(page).toHaveURL(new RegExp(`/en/thank-you\\.html\\?ref=${reference}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Your request has been received' })).toBeVisible();
});

const CASES = [
  ['lowercase is normalised', () => reference.toLowerCase(), 'verified'],
  ['surrounding whitespace is trimmed', () => `%20${reference}%20`, 'verified'],
  ['extra query parameters are ignored', () => `${reference}&utm_source=x`, 'verified'],
  ['well-formed but unknown', () => 'A1B2C3D4E5F6', 'not-found'],
  ['too short', () => 'A1B2C3', 'unavailable'],
  ['too long', () => `${reference}00`, 'unavailable'],
  ['invalid characters', () => 'A1B2C3D4E5FZ', 'unavailable'],
];

for (const [title, ref, expected] of CASES) {
  test(`${title} → ${expected}`, async ({ page }) => {
    await page.goto(`/thank-you.html?ref=${ref()}`);
    await expect(statusOf(page)).toHaveAttribute('data-status', expected);
  });
}

test('missing reference → unavailable', async ({ page }) => {
  await page.goto('/thank-you.html');
  await expect(statusOf(page)).toHaveAttribute('data-status', 'unavailable');
});

test('markup in the reference is never rendered', async ({ page }) => {
  let dialogOpened = false;
  page.on('dialog', (dialog) => { dialogOpened = true; dialog.dismiss(); });
  await page.goto(`/thank-you.html?ref=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
  await expect(statusOf(page)).toHaveAttribute('data-status', 'unavailable');
  expect(await page.locator('main img[src="x"]').count()).toBe(0);
  expect(dialogOpened).toBe(false);
});

test('unreachable verification never claims success, and retry recovers', async ({ page }) => {
  let failVerification = true;
  await page.route('**/api/enquiries/*', (route) => (failVerification
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    : route.continue()));

  await page.goto(`/thank-you.html?ref=${reference}`);
  await expect(statusOf(page)).toHaveAttribute('data-status', 'unverified');
  await expect(page.locator('[data-state="unverified"] [data-ref-value]')).toHaveText(reference);

  failVerification = false;
  await page.locator('[data-retry]').click();
  await expect(statusOf(page)).toHaveAttribute('data-status', 'verified');
  await expect(page.locator('#verified-title')).toBeFocused();
});

test('copy button copies the reference', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions can only be granted in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/thank-you.html?ref=${reference}`);

  const button = page.locator('[data-state="verified"] [data-copy]');
  await button.click();
  await expect(button).toHaveAttribute('data-copy-status', 'done');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(reference);
  await expect(page.locator('[data-announcer]')).toHaveText('شماره پیگیری کپی شد.');
});
