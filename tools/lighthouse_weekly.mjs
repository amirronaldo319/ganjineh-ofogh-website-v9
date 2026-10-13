// Weekly Lighthouse run on the live site (mobile profile), with budgets and a comparison with the previous week.
//
//   node tools/lighthouse_weekly.mjs https://ganjinehofogh.ir
//   node tools/lighthouse_weekly.mjs http://127.0.0.1:8000 --webhook https://…
//
// Writes reports/lighthouse-YYYY-MM-DD.json (+ .md). Exit code 1 when a page is under budget or fell more than
// DROP points since the last report, so a scheduler (cron, launchd, a CI job) can alert on it.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || '').replace(/\/$/, '');
const webhook = args.includes('--webhook') ? args[args.indexOf('--webhook') + 1] : process.env.GO_NOTIFY_WEBHOOK || '';
if (!base) { console.error('usage: node tools/lighthouse_weekly.mjs <site url> [--webhook <https url>]'); process.exit(64); }

// Budgets: the lowest acceptable score per category. Performance is lower because the lab run simulates a slow phone.
const BUDGET = { performance: 75, accessibility: 95, 'best-practices': 95, seo: 95 };
const DROP = 5;
const PAGES = ['/', '/en/', '/residences.html', '/residence-2.html', '/compare.html', '/brochure.html', '/gallery.html', '/contact.html', '/en/residence-2.html'];

let lighthouse, chromeLauncher;
try {
  lighthouse = (await import(require.resolve('lighthouse/core/index.js'))).default;
  chromeLauncher = await import(require.resolve('chrome-launcher'));
} catch { console.error('lighthouse is not installed here: run `npm install` in the project first.'); process.exit(69); }

const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless=new', '--no-sandbox'] });
const results = {};
for (const page of PAGES) {
  const { lhr } = await lighthouse(base + page, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: Object.keys(BUDGET) });
  results[page] = {
    scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
    lcp: lhr.audits['largest-contentful-paint'].displayValue, cls: lhr.audits['cumulative-layout-shift'].displayValue, tbt: lhr.audits['total-blocking-time'].displayValue,
    bytes: lhr.audits['total-byte-weight'].displayValue,
  };
}
await chrome.kill();

const dir = path.join(ROOT, 'reports');
fs.mkdirSync(dir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const previousFile = fs.readdirSync(dir).filter((f) => /^lighthouse-\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `lighthouse-${today}.json`).sort().pop();
const previous = previousFile ? JSON.parse(fs.readFileSync(path.join(dir, previousFile), 'utf8')).results : {};

const problems = [];
const lines = [`# Lighthouse · ${base} · ${today}`, '', previousFile ? `Compared with ${previousFile}.` : 'First report: nothing to compare with yet.', '',
  '| Page | Perf | A11y | Best practice | SEO | LCP | CLS | TBT | Weight |', '|---|---|---|---|---|---|---|---|---|'];
for (const [page, r] of Object.entries(results)) {
  const cells = Object.keys(BUDGET).map((k) => {
    const was = previous[page]?.scores?.[k];
    const now = r.scores[k];
    if (now < BUDGET[k]) problems.push(`${page} ${k} ${now} is under the budget of ${BUDGET[k]}`);
    if (was !== undefined && was - now > DROP) problems.push(`${page} ${k} fell from ${was} to ${now}`);
    return `${now}${was !== undefined && was !== now ? ` (${now > was ? '+' : ''}${now - was})` : ''}`;
  });
  lines.push(`| \`${page}\` | ${cells.join(' | ')} | ${r.lcp} | ${r.cls} | ${r.tbt} | ${r.bytes.replace('Total size was ', '')} |`);
}
lines.push('', problems.length ? '## Needs attention\n\n' + problems.map((p) => `- ${p}`).join('\n') : 'All pages are within budget.');
fs.writeFileSync(path.join(dir, `lighthouse-${today}.json`), JSON.stringify({ site: base, date: today, budget: BUDGET, results }, null, 1));
fs.writeFileSync(path.join(dir, `lighthouse-${today}.md`), lines.join('\n') + '\n');
console.log(lines.join('\n'));

if (problems.length && /^https?:/.test(webhook)) {
  const text = `⚠ Lighthouse ${base}: ${problems.length} issue(s) — ${problems.slice(0, 4).join('; ')}`;
  await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'lighthouse', site: base, problems, text }) }).catch((e) => console.error('alert not sent:', e.message));
}
process.exit(problems.length ? 1 : 0);
