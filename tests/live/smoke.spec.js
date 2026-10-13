// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = ['', 'project', 'architecture', 'residences', 'residence-1', 'residence-2', 'residence-3', 'residence-4', 'compare', 'faq',
  'lifestyle', 'location', 'gallery', 'developer', 'brochure', 'contact', 'privacy'];
const path = (lang, name) => `${lang === 'en' ? '/en' : ''}/${name ? name + '.html' : ''}`;

for (const lang of ['fa', 'en']) {
  test.describe(`live · ${lang}`, () => {
    for (const name of PAGES) {
      test(`${name || 'home'} loads with its own title, language and share card`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const response = await page.goto(path(lang, name), { waitUntil: 'load' });
        expect(response?.status()).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.locator('h1:visible')).toHaveCount(1);
        expect((await page.title()).length).toBeGreaterThan(5);
        const og = await page.locator('meta[property="og:image"]').getAttribute('content');
        expect(og).toMatch(/\/assets\/og\/[\w-]+-(fa|en)\.jpg$/);
        expect((await page.request.get(og.replace(/^https?:\/\/[^/]+/, ''))).status()).toBe(200);
        expect(errors).toEqual([]);
      });
    }
  });
}

test('the language switch leads to the other language of the same page', async ({ page }) => {
  await page.goto('/residence-2.html');
  await page.waitForFunction(() => !!window.ofogh);
  await page.locator('#lang-btn').click();
  await expect(page).toHaveURL(/\/en\/residence-2/);
  await expect(page.locator('h1')).toHaveText('Apartment 2');
});

test('compare works and keeps its pair in the address', async ({ page }) => {
  await page.goto('/en/compare.html');
  await page.locator('#cmp-b').selectOption('4');
  await expect(page.locator('#cmp-diff')).toContainText('Apartment 4 is 18.75 m²');
  await expect(page).toHaveURL(/b=4/);
});

test('the brochure form tells the truth about whether requests are open', async ({ page }) => {
  await page.goto('/en/brochure.html');
  const status = page.locator('#form-status');
  await expect(status).not.toHaveText(/Checking/);
  const text = (await status.textContent()) || '';
  expect(text).toMatch(/Requests are not open|will be ready to download|sales team will send|not active/);
});

test('both 3D viewers open on demand', async ({ page }) => {
  await page.goto('/en/residence-2.html');
  await page.locator('#res3d-launch').click();
  await expect(page.locator('#res3d iframe')).toHaveCount(1);
  const r = await page.request.get('/tower-viewer/');
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain('three');
});

test('private and source files are not published', async ({ request }) => {
  const exposed = [];
  for (const p of ['/server.py', '/admin.py', '/src/pages/index.html', '/tools/build_site.py', '/tests/e2e/pages.spec.js', '/.git/config', '/var/enquiries.sqlite3']) {
    const r = await request.get(p, { maxRedirects: 0 });
    if (r.status() === 200) exposed.push(p);
  }
  expect(exposed, 'these files should not be public').toEqual([]);
});

test('robots.txt and sitemap.xml are present', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('hreflang="en"');
});
