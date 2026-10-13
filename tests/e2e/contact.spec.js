// @ts-check
const { test, expect } = require('@playwright/test');

test('enquiry form submits (Persian page, Jalali date), lands on a verified confirmation, and Back cannot resubmit', async ({ page }) => {
  await page.goto('/index.html');
  await page.goto('/contact.html?unit=type-d');   // legacy V8 link: maps to apartment 2
  await expect(page.locator('#residence-interest')).toHaveValue('residence-2');

  const submit = page.locator('[data-submit-label]');
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText('ارسال درخواست بازدید');

  // Jalali picker: the visible field is Persian, the submitted value is Gregorian ISO.
  await page.locator('#visit-date-btn').click();
  const day = page.locator('.jdate__d:not(:disabled)').last();
  await day.click();
  const iso = await page.locator('#visit-date').inputValue();
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await page.locator('#visit-date-btn').innerText()).toMatch(/[۰-۹]/);

  await page.locator('#name').fill('E2E Visitor');
  await page.locator('#mobile').fill('۰۹۱۲۰۰۰۰۰۰۰');
  await page.locator('input[name="consent"]').check();
  await submit.click();

  await expect(page).toHaveURL(/thank-you\.html\?ref=[A-F0-9]{12}$/);
  await expect(page.locator('[data-confirmation]')).toHaveAttribute('data-status', 'verified');
  await page.goBack();
  await expect(page).not.toHaveURL(/contact\.html/);
});

test('Jalali conversion matches known Nowruz dates and leap years', async ({ page }) => {
  await page.goto('/contact.html');
  const r = await page.evaluate(() => {
    const J = window.OfoghJalali;
    return {
      n1403: J.toGregorian(1403, 1, 1), n1404: J.toGregorian(1404, 1, 1), n1405: J.toGregorian(1405, 1, 1),
      back: J.toJalali(2026, 3, 21), leap1403: J.monthLength(1403, 12), common1404: J.monthLength(1404, 12),
    };
  });
  expect(r.n1403).toEqual([2024, 3, 20]);
  expect(r.n1404).toEqual([2025, 3, 21]);
  expect(r.n1405).toEqual([2026, 3, 21]);
  expect(r.back).toEqual([1405, 1, 1]);
  expect(r.leap1403).toBe(30);
  expect(r.common1404).toBe(29);
});

test('English page keeps the native date input and English messages', async ({ page }) => {
  await page.goto('/en/contact.html');
  await expect(page.locator('#visit-date')).toHaveAttribute('type', 'date');
  const submit = page.locator('[data-submit-label]');
  await expect(submit).toHaveText('Send viewing request');
  await page.locator('[data-route="brochure"]').click();
  await expect(submit).toHaveText('Send brochure request');
  await expect(page.locator('#form-status')).toHaveText(/Requests are being accepted/);
});

test('invalid mobile number is rejected before anything is sent', async ({ page }) => {
  let posted = false;
  page.on('request', (request) => { if (request.method() === 'POST') posted = true; });
  await page.goto('/en/contact.html');

  const submit = page.locator('[data-submit-label]');
  await expect(submit).toBeEnabled();
  await page.locator('#name').fill('E2E Visitor');
  await page.locator('#mobile').fill('12345');
  await page.locator('input[name="consent"]').check();
  await submit.click();

  await expect(page.locator('#mobile-error')).toHaveText('Enter a valid mobile number.');
  await expect(page).toHaveURL(/contact\.html/);
  expect(posted).toBe(false);
});

test('no contact channel is shown until site.config.json has one', async ({ page }) => {
  await page.goto('/en/contact.html');
  // With an empty config nothing is invented: no tel:, wa.me or social links.
  expect(await page.locator('.channels').count()).toBe(0);
  expect(await page.locator('a[href^="tel:"], a[href*="wa.me"], a[href*="t.me/"]').count()).toBe(0);
});
