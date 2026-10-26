const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNuxtPage, PAGE_ERROR_CODES } = require('./pageData');

function page(script, body = '') {
  return `<html><head><title>Importer profile</title></head><body>${body}<script>${script}</script></body></html>`;
}

function expectError(operation, code, inspect = () => {}) {
  assert.throws(operation, error => {
    assert.equal(error.code, code);
    inspect(error);
    return true;
  });
}

test('parses the original Nuxt IIFE payload', () => {
  const html = page('window.__NUXT__=(function(a){return {state:{profile:{shipments:[{shipments:[{BillOfLading:a}]}]}}};}("BOL-001"));');

  assert.deepEqual(parseNuxtPage(html), {
    state: { profile: { shipments: [{ shipments: [{ BillOfLading: 'BOL-001' }] }] } },
  });
});

test('accepts whitespace and direct object assignment', () => {
  const payload = { state: { profile: { shipments: [{ shipments: [] }] } } };
  const html = page(`window.__NUXT__ \n = \n ${JSON.stringify(payload)};`);

  assert.deepEqual(parseNuxtPage(html), payload);
});

test('does not truncate a shipment description containing the old IIFE terminator', () => {
  const payload = { state: { profile: { shipments: [{ shipments: [{ ProductDescription: ['hardware )); parts'] }] }] } } };
  const html = page(`window.__NUXT__ = ${JSON.stringify(payload)};`);

  assert.deepEqual(parseNuxtPage(html), payload);
});

test('distinguishes malformed Nuxt JavaScript from a missing payload', () => {
  expectError(() => parseNuxtPage(page('window.__NUXT__ = { state: ; };')), PAGE_ERROR_CODES.INVALID);
});

test('reports missing payload for ordinary HTML', () => {
  expectError(
    () => parseNuxtPage('<html><head><title>Supplier profile</title></head><body>Profile</body></html>'),
    PAGE_ERROR_CODES.MISSING
  );
});

test('identifies an HTTP 200 EO verification response and preserves response diagnostics', () => {
  const responseUrl = 'https://www.importgenius.cn/importers/example';
  const response = {
    status: 200,
    headers: { 'content-type': 'text/html' },
    request: { res: { responseUrl } },
  };
  const html = '<html><head><title>Verification</title></head><body><script>document.cookie="EO_Bot_Ssid=example";</script></body></html>';

  expectError(() => parseNuxtPage(html, { label: '详情页', response }), PAGE_ERROR_CODES.BLOCKED, error => {
    assert.match(error.message, /200/);
    assert.ok(error.message.includes(responseUrl));
    assert.ok(error.message.includes('text/html'));
    assert.ok(error.message.includes('详情页'));
  });
});

test('identifies a Cloudflare challenge without a Nuxt assignment', () => {
  const html = '<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>';

  expectError(() => parseNuxtPage(html), PAGE_ERROR_CODES.BLOCKED);
});

test('does not mistake valid shipment data mentioning CAPTCHA for a challenge page', () => {
  const payload = { state: { profile: { shipments: [{ shipments: [{ ProductDescription: ['CAPTCHA brand cabinet hardware'] }] }] } } };

  assert.deepEqual(parseNuxtPage(page(`window.__NUXT__ = ${JSON.stringify(payload)};`, 'CAPTCHA')), payload);
});

test('disables dynamic code generation in payload scripts', () => {
  expectError(
    () => parseNuxtPage(page('window.__NUXT__ = new Function("return {state:{profile:{}}}")();')),
    PAGE_ERROR_CODES.INVALID
  );
});

test('rejects absent and null Nuxt values as invalid payloads', async t => {
  for (const value of ['undefined', 'null']) {
    await t.test(value, () => {
      expectError(() => parseNuxtPage(page(`window.__NUXT__ = ${value};`)), PAGE_ERROR_CODES.INVALID);
    });
  }
});
