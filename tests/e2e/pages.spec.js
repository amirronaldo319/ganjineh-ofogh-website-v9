// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = [
  'index', 'project', 'architecture', 'residences',
  'residence-1', 'residence-2', 'residence-3', 'residence-4',
  'lifestyle', 'location', 'gallery', 'developer', 'contact', 'privacy', 'thank-you',
];
const url = (lang, name) => (lang === 'en' ? `/en/${name}.html` : `/${name}.html`);

for (const lang of ['fa', 'en']) {
  test.describe(`language: ${lang}`, () => {
    for (const name of PAGES) {
      test(`${name}: loads cleanly, one visible h1, no overflow, no errors`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

        const response = await page.goto(url(lang, name), { waitUntil: 'load' });
        expect(response?.status()).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
        await expect(page.locator('h1:visible')).toHaveCount(1);
        expect(await page.locator('img:not([alt])').count()).toBe(0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        expect(errors.filter((e) => !/api\/status/.test(e))).toEqual([]);
      });
    }
  });
}

test('every page declares both languages, a matching canonical and a working counterpart', async ({ page, request }) => {
  for (const name of PAGES) {
    for (const lang of ['fa', 'en']) {
      await page.goto(url(lang, name));
      const links = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => [l.hreflang, l.href])));
      expect(links.fa, `${lang}/${name} fa`).toMatch(/^https:\/\/ganjinehofogh\.ir\//);
      expect(links.en, `${lang}/${name} en`).toContain('/en/');
      expect(links['x-default']).toBe(links.fa);
      const canonical = await page.locator('link[rel=canonical]').getAttribute('href');
      expect(canonical).toBe(lang === 'fa' ? links.fa : links.en);
      const alt = await page.locator('meta[name=go-alt]').getAttribute('content');
      const counterpart = new URL(alt, page.url()).pathname;
      expect((await request.get(counterpart)).status()).toBe(200);
    }
  }
});

test('English pages leave no Persian text outside the language switch', async ({ page }) => {
  for (const name of PAGES) {
    await page.goto(url('en', name));
    const leftovers = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((e) => e.children.length === 0 && /[؀-ۿ]/.test(e.textContent || '') && !e.closest('svg,script,style,#lang-btn,.fa,.l-fa'))
      .map((e) => (e.textContent || '').trim().slice(0, 40)));
    expect(leftovers, `${name} has untranslated text`).toEqual([]);
  }
});

test('unknown paths get a 404 page in the right language, with root-absolute assets', async ({ page }) => {
  let response = await page.goto('/no/such/page');
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  expect(await page.locator('link[rel=stylesheet]').getAttribute('href')).toMatch(/^\/assets\//);
  response = await page.goto('/en/no/such/page');
  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('This page could not be found');
});

test('sitemap lists both languages with alternates, and the share image exists', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('https://ganjinehofogh.ir/en/residence-2.html');
  expect(xml).toContain('hreflang="x-default"');
  expect((await request.get('/assets/img/og.jpg')).status()).toBe(200);
});

test('text assets are gzipped, versioned assets are cached for a year', async ({ request }) => {
  const html = await request.get('/index.html', { headers: { 'Accept-Encoding': 'gzip' } });
  expect(html.headers()['content-encoding']).toBe('gzip');
  expect(html.headers()['cache-control']).toBe('no-cache');
  const css = await request.get('/assets/css/site.min.css?v=1', { headers: { 'Accept-Encoding': 'gzip' } });
  expect(css.headers()['content-encoding']).toBe('gzip');
  expect(css.headers()['cache-control']).toContain('immutable');
  expect((await css.text()).length).toBeGreaterThan(50_000);
});
