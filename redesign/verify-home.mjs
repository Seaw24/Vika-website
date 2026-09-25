import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = await fs.readFile('index.html', 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^https?:/.test(url)) continue;
  if (url.startsWith('#')) {
    assert.ok(html.includes(`id="${url.slice(1)}"`), `Missing anchor ${url}`);
  } else {
    await fs.access(decodeURIComponent(url));
  }
}

const source = await fs.readFile('home.js', 'utf8');
async function submitCase(values, failure = false) {
  const events = {};
  const status = { textContent: '' };
  const button = { disabled: false, textContent: '' };
  const phone = { addEventListener() {}, setCustomValidity(value) { this.error = value; }, reportValidity() {} };
  const form = {
    elements: { phone, name: { focus() {} } },
    addEventListener(name, handler) { events[name] = handler; },
    querySelector() { return button; },
    reset() { this.didReset = true; },
  };
  const requests = [];
  vm.runInNewContext(source, {
    document: {
      querySelectorAll() { return []; },
      querySelector(selector) { return selector === '.mobile-menu' ? { querySelectorAll() { return []; } } : form; },
      addEventListener() {}, getElementById() { return status; },
    },
    FormData: class { constructor() { return Object.entries(values); } },
    AbortController, setTimeout, clearTimeout,
    async fetch(url, options) {
      requests.push({ url, options });
      if (failure) throw new Error('Offline');
      return { type: 'opaque' };
    },
  });
  await events.submit({ preventDefault() {} });
  return { form, phone, requests, status, button };
}
const valid = { name: ' Test User ', email: 'test@example.com', phone: '0912 345 678', code: '' };
const sent = await submitCase(valid);
assert.equal(sent.requests.length, 1);
assert.deepEqual(JSON.parse(sent.requests[0].options.body), { ...valid, name: 'Test User', phone: '+84912345678' });
assert.equal(sent.requests[0].options.mode, 'no-cors');
assert.equal(sent.form.didReset, true);
assert.equal(sent.button.disabled, false);
const failed = await submitCase(valid, true);
assert.equal(failed.form.didReset, undefined);
assert.equal(failed.button.disabled, false);
assert.match(failed.status.textContent, /Chưa thể xác nhận/);
const invalid = await submitCase({ ...valid, phone: '123' });
assert.equal(invalid.requests.length, 0);
assert.ok(invalid.phone.error);
const emptyName = await submitCase({ ...valid, name: '   ' });
assert.equal(emptyName.requests.length, 0);
console.log('Passed local asset/anchor checks and signup payload, invalid-input, and failure cases. No live submissions sent.');
