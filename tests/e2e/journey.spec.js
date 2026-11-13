// @ts-check
// The scroll-driven walk on the home page (#journey): five existing renders, pinned while you scroll.
// It must advance AND reverse, always be skippable, keep every picture's honesty label, show the whole picture on a phone,
// and fall back to a plain readable list without JavaScript, with reduced motion, and on Data Saver.
const { test, expect } = require('@playwright/test');

const URLS = { fa: '/index.html', en: '/en/index.html' };
const SCENES = 5;

/** scroll so that the walk is at position j (0 = first scene … 4 = last); one scene per 60% of a screen. */
const scrollTo = (page, j) => page.evaluate((j) => {
  const section = document.querySelector('#journey');
  const top = section.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + j * window.innerHeight * 0.6, behavior: 'instant' });
}, j);

const opacities = (page) => page.evaluate(() => [...document.querySelectorAll('#journey .scene__pic')].map((e) => +(+getComputedStyle(e).opacity).toFixed(2)));
const stickPosition = (page) => page.evaluate(() => getComputedStyle(document.querySelector('#journey .journey__stick')).position);

for (const lang of ['fa', 'en']) {
  test.describe(`journey · ${lang}`, () => {
    test('advances scene by scene and reverses cleanly', async ({ page }) => {
      await page.goto(URLS[lang]);
      await page.waitForFunction(() => !!window.ofogh);
      expect(await stickPosition(page)).toBe('sticky');

      await scrollTo(page, 0);
      await expect.poll(() => opacities(page)).toEqual([1, 0, 0, 0, 0]);
      await scrollTo(page, 0.5);
      await expect.poll(() => opacities(page)).toEqual([1, 0.5, 0, 0, 0]);   // a crossfade over the previous scene, never a dip to black
      await scrollTo(page, 2);
      await expect.poll(() => opacities(page)).toEqual([1, 1, 1, 0, 0]);
      await expect(page.locator('#journey')).toHaveAttribute('data-scene', '2');
      await scrollTo(page, SCENES - 1);
      await expect.poll(() => opacities(page)).toEqual([1, 1, 1, 1, 1]);

      // and back again: the same positions give the same pictures
      await scrollTo(page, 2);
      await expect.poll(() => opacities(page)).toEqual([1, 1, 1, 0, 0]);
      await scrollTo(page, 0);
      await expect.poll(() => opacities(page)).toEqual([1, 0, 0, 0, 0]);
      await expect(page.locator('#journey')).toHaveAttribute('data-scene', '0');
    });

    test('only the caption of the current scene is readable', async ({ page }) => {
      await page.goto(URLS[lang]);
      await page.waitForFunction(() => !!window.ofogh);
      for (let i = 0; i < SCENES; i++) {
        await scrollTo(page, i);
        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#journey .scene__text')].map((e) => +(+getComputedStyle(e).opacity).toFixed(1))))
          .toEqual(Array.from({ length: SCENES }, (_, k) => (k === i ? 1 : 0)));
      }
    });

    test('every scene says what kind of picture it is, and has alternative text', async ({ page }) => {
      await page.goto(URLS[lang]);
      await page.waitForFunction(() => !!window.ofogh);
      const kinds = await page.locator('#journey .scene__pic .kind').allTextContents();
      expect(kinds).toHaveLength(SCENES);
      for (const k of kinds) expect(k.trim().length).toBeGreaterThan(5);
      const alts = await page.locator('#journey .scene__pic img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt') || ''));
      for (const a of alts) expect(a.trim().length).toBeGreaterThan(10);
      // the page keeps its single h1; the walk adds one h2 and one h3 per scene
      expect(await page.locator('#journey h2').count()).toBe(1);
      expect(await page.locator('#journey h3').count()).toBe(SCENES);
    });

    test('the skip link is visible while pinned and jumps to the day-to-dusk section', async ({ page }) => {
      await page.goto(URLS[lang]);
      await page.waitForFunction(() => !!window.ofogh);
      await scrollTo(page, 1);
      const skip = page.locator('#journey .journey__skip');
      await expect(skip).toBeVisible();
      expect((await skip.boundingBox())?.height).toBeGreaterThanOrEqual(40);
      await skip.click();
      await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('#daydusk').getBoundingClientRect().top)), { timeout: 8000 }).toBeLessThan(120);
      await expect.poll(() => new URL(page.url()).hash).toBe('#daydusk');   // the site's glide writes the hash when it lands
    });
  });
}

test.describe('journey · fallbacks', () => {
  test('reduced motion: a plain stack, every picture visible, nothing pinned', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    expect(await stickPosition(page)).toBe('static');
    expect(await opacities(page)).toEqual([1, 1, 1, 1, 1]);
    await expect(page.locator('#journey .journey__skip')).toBeHidden();
    await expect(page.locator('#journey .scene__text h3').first()).toBeVisible();
    await expect(page.locator('#journey .scene__text h3').last()).toBeAttached();
  });

  test('Data Saver gets the plain stack too', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true }); });
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('data-lite', '1');
    expect(await stickPosition(page)).toBe('static');
    expect(await opacities(page)).toEqual([1, 1, 1, 1, 1]);
  });
});

test.describe('journey · without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('it is a plain list that can be read in full', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveClass(/no-js/);
    expect(await stickPosition(page)).toBe('static');
    expect(await opacities(page)).toEqual([1, 1, 1, 1, 1]);
    await expect(page.locator('#journey .scene__text h3')).toHaveCount(SCENES);
  });
});

/** the portrait layout (aspect 3:4 or taller): whole picture in a 3:2 frame, caption underneath, nothing on top of anything else */
for (const [name, width, height] of [['phone 390×844', 390, 844], ['phone 375×667', 375, 667], ['phone 360×740', 360, 740], ['Pixel 412×915', 412, 915], ['tablet 768×1024', 768, 1024]]) {
  test.describe(`journey · portrait · ${name}`, () => {
    test.use({ viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700 });
    test('the whole picture is shown (not cropped) and the caption fits, clear of the bar and the back-to-top button', async ({ page }) => {
      await page.goto('/index.html');
      await page.waitForFunction(() => !!window.ofogh);
      for (const j of [0, 2, 4]) {
        await scrollTo(page, j);
        await expect.poll(() => page.evaluate((j) => document.querySelector('#journey').dataset.scene === String(j), j)).toBe(true);
        await page.waitForFunction((j) => { const i = document.querySelectorAll('#journey .scene__pic img')[j]; return i.complete && i.naturalWidth > 0; }, j);   // lazy-loaded
        await page.waitForTimeout(450);   // the back-to-top button eases in
        const m = await page.evaluate((j) => {
          const img = document.querySelectorAll('#journey .scene__pic img')[j];
          const text = document.querySelectorAll('#journey .scene__text')[j].getBoundingClientRect();
          const b = img.closest('.scene__pic').getBoundingClientRect();   // the frame (the img sits inside a <picture>)
          const bar = document.querySelector('#journey .journey__bar').getBoundingClientRect();
          const up = document.querySelector('.totop').getBoundingClientRect();
          return { frameRatio: b.width / b.height, natural: img.naturalWidth / img.naturalHeight, left: b.left, right: b.right, vw: innerWidth,
            captionBottom: text.bottom, barTop: bar.top, sideways: document.documentElement.scrollWidth - innerWidth,
            hitsButton: text.left < up.right && text.right > up.left && text.top < up.bottom && text.bottom > up.top };
        }, j);
        expect(Math.abs(m.frameRatio - m.natural)).toBeLessThan(0.03);   // the frame has the picture's own shape: nothing is cut off
        expect(m.left).toBeGreaterThanOrEqual(-1);
        expect(m.right).toBeLessThanOrEqual(m.vw + 1);
        expect(m.captionBottom).toBeLessThanOrEqual(m.barTop + 2);
        expect(m.hitsButton).toBe(false);
        expect(m.sideways).toBeLessThanOrEqual(1);
      }
    });
  });
}

/** near-square windows: the whole picture is shown (letterboxed), never cropped, and the caption still fits */
for (const [name, width, height] of [['841×863', 841, 863], ['1024×900', 1024, 900], ['900×1100', 900, 1100]]) {
  test.describe(`journey · near-square · ${name}`, () => {
    test.use({ viewport: { width, height } });
    test('the picture is contained, not cropped, and the caption clears the bar and the back-to-top button', async ({ page }) => {
      await page.goto('/en/index.html');
      await page.waitForFunction(() => !!window.ofogh);
      for (const j of [1, 2, 3]) {
        await scrollTo(page, j);
        await expect.poll(() => page.evaluate((j) => document.querySelector('#journey').dataset.scene === String(j), j)).toBe(true);
        await expect(page.locator('.totop')).toHaveClass(/is-on/);
        await page.waitForTimeout(450);
        const m = await page.evaluate((j) => {
          const text = document.querySelectorAll('#journey .scene__text')[j].getBoundingClientRect();
          const bar = document.querySelector('#journey .journey__bar').getBoundingClientRect();
          const up = document.querySelector('.totop').getBoundingClientRect();
          return { fit: getComputedStyle(document.querySelectorAll('#journey .scene__pic img')[j]).objectFit, captionBottom: text.bottom, barTop: bar.top,
            hitsButton: text.left < up.right && text.right > up.left && text.top < up.bottom && text.bottom > up.top };
        }, j);
        expect(m.fit).toBe('contain');
        expect(m.captionBottom).toBeLessThanOrEqual(m.barTop + 2);
        expect(m.hitsButton).toBe(false);
      }
    });
  });
}

test.describe('journey · small phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  test('picture and caption still fit, and the heading stays available to screen readers', async ({ page }) => {
    await page.goto('/en/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    await expect(page.locator('#journey .journey__head h2')).toHaveText('A new way to live in Tehran.');
    for (const j of [0, 4]) {
      await scrollTo(page, j);
      await expect.poll(() => page.evaluate((j) => document.querySelector('#journey').dataset.scene === String(j), j)).toBe(true);
      const m = await page.evaluate((j) => ({ cap: document.querySelectorAll('#journey .scene__text')[j].getBoundingClientRect().bottom,
        bar: document.querySelector('#journey .journey__bar').getBoundingClientRect().top, sideways: document.documentElement.scrollWidth - innerWidth }), j);
      expect(m.cap).toBeLessThanOrEqual(m.bar + 2);
      expect(m.sideways).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('journey · landscape phone', () => {
  test.use({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true });
  test('keeps the full-bleed layout, with the caption inside the screen', async ({ page }) => {
    await page.goto('/en/index.html');
    await page.waitForFunction(() => !!window.ofogh);
    await scrollTo(page, 2);
    await expect.poll(() => page.evaluate(() => document.querySelector('#journey').dataset.scene)).toBe('2');
    const m = await page.evaluate(() => ({ cap: document.querySelectorAll('#journey .scene__text')[2].getBoundingClientRect(), vh: innerHeight }));
    expect(m.cap.bottom).toBeLessThanOrEqual(m.vh);
    expect(m.cap.top).toBeGreaterThan(0);
  });
});
