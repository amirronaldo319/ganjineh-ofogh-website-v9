// The Cloudflare Pages Functions backend (functions/) against a local workerd with local D1 and R2.
//
//   node --test tests/cloudflare.test.mjs        (needs `npm install`/node_modules and a built preview: python3 tools/make_preview.py)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = '/tmp/ganjineh-preview';
const PDF = path.join(ROOT, 'tests', 'fixtures', 'brochure-sample.pdf');
const PASSWORD = 'correct horse battery staple';
const AUTH = { authorization: 'Basic ' + Buffer.from(`admin:${PASSWORD}`).toString('base64') };
const WRANGLER = ['--yes', 'wrangler@latest'];
const servers = [];
const fetchT = (url, opts = {}) => fetch(url, { signal: AbortSignal.timeout(20000), ...opts });

function seed(persist, { pdf = true } = {}) {
  execFileSync('npx', [...WRANGLER, 'd1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', path.join(ROOT, 'cloudflare', 'schema.sql')], { cwd: ROOT, stdio: 'pipe' });
  if (pdf) execFileSync('npx', [...WRANGLER, 'r2', 'object', 'put', 'ganjineh-brochure/brochure.pdf', '--file', PDF, '--local', '--persist-to', persist], { cwd: ROOT, stdio: 'pipe' });
}

async function start(port, bindings, { dir = PREVIEW, pdf = true } = {}) {
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-test-'));
  seed(persist, { pdf });
  const args = [...WRANGLER, 'pages', 'dev', dir, '--port', String(port), '--persist-to', persist, '--binding', ...Object.entries(bindings).map(([k, v]) => `${k}=${v}`)];
  // detached + ignored stdio: the server (npx → wrangler → workerd) is a process tree, killed as a group in after()
  const child = spawn('npx', args, { cwd: ROOT, stdio: 'ignore', detached: true });
  child.unref();
  servers.push(child);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetchT(base + '/api/status')).ok) return base; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('wrangler pages dev did not start on ' + port);
}

let n = 0;
const ip = () => ({ 'cf-connecting-ip': `10.1.0.${++n}` });
const post = (base, body, headers = {}) => fetchT(base + '/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json', ...ip(), ...headers }, body: JSON.stringify(body) });
const visitor = (extra = {}) => ({ route: 'download', name: 'Test Visitor', mobile: '09121234567', consent: 'yes', ...extra });
const csrf = (password) => createHmac('sha256', password).update('ganjineh-admin-csrf').digest('hex').slice(0, 32);

let main;
before(async () => { main = await start(8831, { ACCEPT_ENQUIRIES: '1', ADMIN_PASSWORD: PASSWORD }); });
after(() => {
  for (const s of servers) { try { process.kill(-s.pid, 'SIGKILL'); } catch { /* already gone */ } }
  try { execFileSync('pkill', ['-f', 'workerd']); } catch { /* none left */ }
});

test('status reports intake and the brochure', async () => {
  assert.deepEqual(await (await fetchT(main + '/api/status')).json(), { acceptingEnquiries: true, brochureAvailable: true });
});

test('static pages are still served', async () => {
  assert.equal((await fetchT(main + '/en/')).status, 200);
});

test('validation refuses bad input', async () => {
  assert.equal((await post(main, visitor({ mobile: '12345' }))).status, 422);
  assert.equal((await post(main, visitor({ consent: 'no' }))).status, 422);
  assert.equal((await post(main, visitor({ route: 'nope' }))).status, 422);
  assert.equal((await post(main, visitor({ name: 'x' }))).status, 422);
  assert.equal((await post(main, visitor({ website: 'http://spam' }))).status, 400);
  assert.equal((await post(main, visitor(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetchT(main + '/api/enquiries', { method: 'POST', headers: { 'content-type': 'text/plain', ...ip() }, body: '{}' })).status, 415);
});

test('a stored brochure request unlocks the PDF, nothing else does', async () => {
  const created = await post(main, visitor({ mobile: '۰۹۱۲۱۲۳۴۵۶۷', 'residence-interest': 'residence-3' }));
  assert.equal(created.status, 201);
  const { reference } = await created.json();
  assert.match(reference, /^[A-F0-9]{12}$/);
  assert.deepEqual(await (await fetchT(`${main}/api/enquiries/${reference}`, { headers: ip() })).json(), { exists: true, route: 'download', download: true });
  const file = await fetchT(`${main}/api/brochure/${reference}`, { headers: ip() });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(file.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), fs.readFileSync(PDF));

  assert.equal((await fetchT(`${main}/api/brochure/AAAAAAAAAAAA`, { headers: ip() })).status, 404);
  assert.equal((await fetchT(`${main}/api/brochure/not-a-reference`, { headers: ip() })).status, 404);
  const advisor = await (await post(main, visitor({ route: 'advisor' }))).json();
  assert.equal((await fetchT(`${main}/api/brochure/${advisor.reference}`, { headers: ip() })).status, 404);
  assert.equal((await (await fetchT(`${main}/api/enquiries/${advisor.reference}`, { headers: ip() })).json()).download, false);
  assert.equal((await fetchT(`${main}/api/enquiries/ZZZ`, { headers: ip() })).status, 400);
});

test('the sales inbox: login, list, update, export, download record', async () => {
  assert.equal((await fetchT(main + '/admin')).status, 401);
  assert.equal((await fetchT(main + '/admin', { headers: { authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') } })).status, 401);
  assert.equal((await fetchT(main + '/admin/export.csv')).status, 401);

  const made = await (await post(main, visitor({ route: 'visit', name: '=HYPERLINK("http://evil")', 'visit-type': 'phone', 'residence-interest': 'residence-2' }))).json();
  const ref = made.reference;
  const page = await fetchT(main + '/admin', { headers: AUTH });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const html = await page.text();
  assert.ok(html.includes(ref));
  assert.ok(!html.includes('=HYPERLINK("http'));                   // escaped

  const form = (extra = {}) => new URLSearchParams({ csrf: csrf(PASSWORD), reference: ref, status: 'contacted', note: 'called, will visit Friday', ...extra }).toString();
  const post2 = (body, headers = {}) => fetchT(main + '/admin/update', { method: 'POST', redirect: 'manual', headers: { ...AUTH, 'content-type': 'application/x-www-form-urlencoded', ...headers }, body });
  assert.equal((await post2(form())).status, 303);
  assert.equal((await post2(form({ csrf: '0'.repeat(32) }))).status, 403);
  assert.equal((await post2(form(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetchT(main + '/admin/update', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form() })).status, 401);
  assert.ok((await (await fetchT(main + '/admin?status=contacted', { headers: AUTH })).text()).includes('called, will visit Friday'));
  assert.ok(!(await (await fetchT(main + '/admin?status=new', { headers: AUTH })).text()).includes(ref));

  const csv = await fetchT(main + '/admin/export.csv', { headers: AUTH });
  assert.equal(csv.status, 200);
  const bytes = Buffer.from(await csv.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);      // BOM, so Excel reads the Persian
  const text = bytes.toString('utf8');
  assert.ok(text.includes(ref));
  assert.ok(text.includes("'=HYPERLINK"));                         // formula-injection guard
  assert.match(csv.headers.get('content-disposition'), /attachment/);

  const dl = await (await post(main, visitor())).json();
  await fetchT(`${main}/api/brochure/${dl.reference}`, { headers: ip() });
  assert.ok((await (await fetchT(main + '/admin', { headers: AUTH })).text()).includes('دانلود شد'));
});

test('enquiries are rate-limited per visitor', async () => {
  const fixed = { 'cf-connecting-ip': '10.9.9.9' };
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await post(main, visitor(), fixed)).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(201));
  assert.equal(codes[10], 429);
});

test('without ACCEPT_ENQUIRIES the form is closed; without ADMIN_PASSWORD there is no inbox', async () => {
  const closed = await start(8832, {}, { pdf: false });
  assert.deepEqual(await (await fetchT(closed + '/api/status')).json(), { acceptingEnquiries: false, brochureAvailable: false });
  assert.equal((await post(closed, visitor())).status, 503);
  assert.equal((await fetchT(closed + '/admin', { headers: AUTH })).status, 404);
});

test('the optional partner password protects the whole preview', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-gate-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>private</h1>');
  fs.writeFileSync(path.join(dir, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
  const gated = await start(8833, { PREVIEW_PASSWORD: 'partners-only', ACCEPT_ENQUIRIES: '1' }, { dir });
  assert.equal((await fetchT(gated + '/')).status, 401);
  const ok = { authorization: 'Basic ' + Buffer.from('partner:partners-only').toString('base64') };
  const res = await fetchT(gated + '/', { headers: ok });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /private/);
  assert.equal((await fetchT(gated + '/', { headers: { authorization: 'Basic ' + Buffer.from('partner:nope').toString('base64') } })).status, 401);
  assert.equal((await fetchT(gated + '/api/status')).status, 200);   // the form API stays reachable from the gated page
});
