// @ts-check
const { test, expect } = require('@playwright/test');

// The e2e server is started with a sample PDF (tests/fixtures/brochure-sample.pdf) as the brochure.
test.describe.configure({ mode: 'serial' });

test('leave a number, land on the thank-you page, download the PDF (Persian)', async ({ page }) => {
  await page.goto('/brochure.html');
  const submit = page.locator('[data-submit-label]');
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText('دریافت بروشور');
  await expect(page.locator('#form-status')).toContainText('بروشور پس از ثبت');
  await expect(page.locator('[data-when="available"]').first()).toBeVisible();

  await page.locator('#name').fill('E2E Brochure');
  await page.locator('#mobile').fill('۰۹۱۲۱۲۳۴۵۶۷');
  await page.locator('#residence-interest').selectOption('residence-3');
  await page.locator('input[name="consent"]').check();
  await submit.click();

  await expect(page).toHaveURL(/thank-you\.html\?ref=[A-F0-9]{12}$/);
  await expect(page.locator('[data-confirmation]')).toHaveAttribute('data-status', 'verified');
  const box = page.locator('[data-download]');
  await expect(box).toBeVisible();
  await expect(page.locator('[data-for="download-pdf"]')).toBeVisible();
  await expect(page.locator('[data-for="visit"]')).toBeHidden();

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-download-link]').click()]);
  expect(download.suggestedFilename()).toBe('Ganjineh-Ofogh-brochure.pdf');
});

test('English: the same flow, in English, from the /en/ page', async ({ page }) => {
  await page.goto('/en/brochure.html');
  const submit = page.locator('[data-submit-label]');
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText('Get the brochure');
  await page.locator('#name').fill('E2E English');
  await page.locator('#mobile').fill('09121234567');
  await page.locator('input[name="consent"]').check();
  await submit.click();
  await expect(page).toHaveURL(/\/en\/thank-you\.html\?ref=/);
  await expect(page.locator('[data-download-link]')).toHaveText('Download the brochure (PDF)');
  await expect(page.locator('[data-download]')).toBeVisible();
});

test('a bad number is refused before anything is sent', async ({ page }) => {
  let posted = false;
  page.on('request', (r) => { if (r.method() === 'POST') posted = true; });
  await page.goto('/en/brochure.html');
  await expect(page.locator('[data-submit-label]')).toBeEnabled();
  await page.locator('#name').fill('E2E');
  await page.locator('#mobile').fill('123');
  await page.locator('input[name="consent"]').check();
  await page.locator('[data-submit-label]').click();
  await expect(page.locator('#mobile-error')).toHaveText('Enter a valid mobile number.');
  expect(posted).toBe(false);
});

test('a visit request shows the visit steps and no download', async ({ page, request }) => {
  const res = await request.post('/api/enquiries', { data: { route: 'visit', name: 'E2E Visit', mobile: '09121234567', consent: 'yes' } });
  const { reference } = await res.json();
  await page.goto(`/en/thank-you.html?ref=${reference}`);
  await expect(page.locator('[data-confirmation]')).toHaveAttribute('data-status', 'verified');
  await expect(page.locator('[data-for="visit"]')).toBeVisible();
  await expect(page.locator('[data-for="advisor"]')).toBeHidden();
  await expect(page.locator('[data-download]')).toBeHidden();
  await expect(page.locator('.steps')).toContainText('does not commit you to anything');
});
