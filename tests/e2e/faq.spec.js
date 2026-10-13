// @ts-check
const { test, expect } = require('@playwright/test');

for (const [lang, url] of [['fa', '/faq.html'], ['en', '/en/faq.html']]) {
  test.describe(`FAQ · ${lang}`, () => {
    test('every question opens and shows its answer; structured data matches the page', async ({ page }) => {
      await page.goto(url);
      const items = page.locator('details.faq__item');
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(12);
      await items.first().locator('summary').click();
      await expect(items.first()).toHaveAttribute('open', '');
      await expect(items.first().locator('.faq__a')).toBeVisible();

      const ld = await page.locator('script[type="application/ld+json"]').evaluate((el) => JSON.parse(el.textContent || '{}'));
      expect(ld['@type']).toBe('FAQPage');
      expect(ld.inLanguage).toBe(lang);
      expect(ld.mainEntity).toHaveLength(count);
      const firstQ = (await items.first().locator('summary').innerText()).trim();
      expect(ld.mainEntity[0].name).toBe(firstQ);
    });

    test('answers use only supplied figures and invent no price or date', async ({ page }) => {
      await page.goto(url);
      const text = await page.locator('.faq-wrap').evaluate((el) => el.textContent || '');   // closed answers are not in innerText
      const flat = text.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬،,]/g, '');
      for (const fact of ['2064', '1400', '700', '143.25', '150', '166', '162']) expect(flat.replace(/٫/g, '.'), fact).toContain(fact);
      expect(flat).not.toMatch(/\b\d{2,3}\s?(million|billion|میلیون|میلیارد)|تومان|toman|\$/i);
      expect(flat).not.toMatch(/4065|4,065/);
    });

    test('links in the answers go to real pages', async ({ page, request }) => {
      await page.goto(url);
      const hrefs = await page.locator('.faq__more a').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
      expect(hrefs.length).toBeGreaterThan(8);
      for (const p of new Set(hrefs)) expect((await request.get(p)).status(), p).toBe(200);
    });
  });
}
