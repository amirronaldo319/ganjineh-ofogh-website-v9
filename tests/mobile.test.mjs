// The mobile-number rule in the Cloudflare backend and in the two browser forms agrees with the shared cases
// (tests/test_server_rules.py checks server.py against the same file).
//
//   node --test tests/mobile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMobile } from '../functions/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'mobiles.json'), 'utf8'));

test('functions/_lib.js normalizeMobile', () => {
  for (const [typed, stored] of cases) assert.equal(normalizeMobile(typed), stored, JSON.stringify(typed));
});

// The forms only decide valid / not valid (the server stores the number). Their check is the body of validMobile():
// run that exact source against a stand-in field, so the test cannot drift from what ships.
for (const file of ['contact.js', 'brochure.js']) {
  test(`assets/js/${file} accepts and refuses the same numbers`, () => {
    const source = fs.readFileSync(path.join(ROOT, 'assets', 'js', file), 'utf8');
    const body = source.match(/function validMobile\(\) \{\n([\s\S]*?)\n {2}\}/);
    assert.ok(body, 'validMobile() not found');
    const check = new Function('mobile', 'mobileError', 'L', body[1]);
    const field = (value) => ({ value, validationMessage: '', setCustomValidity() {} });
    for (const [typed, stored] of cases) {
      // an untouched (empty) field is the browser's "required" check, not this function's
      if (typed.trim()) assert.equal(check(field(typed.trim()), {}, (fa, en) => en), stored !== '', JSON.stringify(typed));
    }
  });
}
