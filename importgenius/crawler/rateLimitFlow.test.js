const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { fetchImporter } = require('./fetchImporter');
const { fetchShipments } = require('./fetchShipments');
const { PAGE_ERROR_CODES } = require('./pageData');
const { createBatch, pagePath } = require('../storage/batches');

const REQUEST_OPTIONS = {
  pageDelayMs: 0,
  batchDelayMs: 0,
  retry: { maxAttempts: 2, baseDelayMs: 0, delay: async () => {}, log: () => {} },
};

function importer(page) {
  return { company: `Importer page ${page}`, url: `importers/company-${page}` };
}

function response(url, data, status = 200) {
  return {
    status,
    data,
    headers: { 'content-type': 'text/html' },
    config: { url },
    request: { res: { responseUrl: url } },
  };
}

function nuxtPage(payload) {
  return `<html><head><title>ImportGenius</title></head><body><script>window.__NUXT__ = ${JSON.stringify(payload)};</script></body></html>`;
}

function mockFilesystem(t) {
  const writes = [];
  const renameTargets = [];
  t.mock.method(fs, 'readdir', async () => ['4.json', '2.json', '3.json', '1.json']);
  t.mock.method(fs, 'readFile', async filename => {
    const page = Number(path.basename(filename, '.json'));
    return JSON.stringify([importer(page)]);
  });
  t.mock.method(fs, 'mkdir', async () => {});
  t.mock.method(fs, 'writeFile', async (filename, contents) => { writes.push({ filename, contents }); });
  t.mock.method(fs, 'rename', async (source, target) => { renameTargets.push(target); });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  return { writes, renameTargets };
}

function mockRateLimitedPages(t, pageFromUrl, payloadForPage) {
  const attempts = new Map();
  const requestedPages = [];
  const get = t.mock.method(axios, 'get', async url => {
    const page = pageFromUrl(url);
    requestedPages.push(page);
    const attempt = (attempts.get(page) || 0) + 1;
    attempts.set(page, attempt);
    if (attempt === 1) {
      throw Object.assign(new Error('Request failed with status code 429'), {
        code: 'ERR_BAD_REQUEST',
        response: response(url, '<html><head><title>Too Many Requests</title></head></html>', 429),
      });
    }
    return response(url, nuxtPage(payloadForPage(page)));
  });
  return { get, requestedPages };
}

test('list collection accumulates HTTP 429 across successful pages and stops on the third limit', async t => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'importgenius-rate-limit-'));
  t.after(() => fs.rm(dataRoot, { recursive: true, force: true }));
  const batch = await createBatch('usa', [1, 2, 3, 4], { dataRoot, environment: 'local', source: 'test' });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const { get, requestedPages } = mockRateLimitedPages(
    t,
    url => Number(new URL(url).pathname.match(/\/latest\/(\d+)$/)[1]),
    page => ({ state: { tradebase: { traders: { us: { importers: { [page]: [importer(page)] } } } } } })
  );

  await assert.rejects(fetchImporter('usa', [1, 2, 3, 4], { ...REQUEST_OPTIONS, batch }), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.RATE_LIMITED);
    assert.equal(error.rateLimitCount, 3);
    assert.match(error.message, /超过允许的 2 次/);
    return true;
  });

  assert.equal(get.mock.callCount(), 5);
  assert.deepEqual(requestedPages, [1, 1, 2, 2, 3]);
  for (const page of [1, 2]) {
    assert.deepEqual(JSON.parse(await fs.readFile(pagePath(batch, page), 'utf8')), [importer(page)]);
  }
  await assert.rejects(fs.stat(pagePath(batch, 3)), { code: 'ENOENT' });
  await assert.rejects(fs.stat(pagePath(batch, 4)), { code: 'ENOENT' });
  const manifest = JSON.parse(await fs.readFile(path.join(batch.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.pageStates[1].list.status, 'success');
  assert.ok(manifest.pageStates[1].list.capturedAt);
  assert.equal(manifest.pageStates[2].list.status, 'success');
  assert.ok(manifest.pageStates[2].list.capturedAt);
  assert.equal(manifest.pageStates[3].list.status, 'failed');
  assert.match(manifest.pageStates[3].list.error, /响应累计 3 次/);
  assert.equal(manifest.pageStates[4].list.status, 'pending');
});

test('shipment collection accumulates HTTP 429 across checkpoint files despite successful retries', async t => {
  const { writes, renameTargets } = mockFilesystem(t);
  const { get, requestedPages } = mockRateLimitedPages(
    t,
    url => Number(new URL(url).pathname.match(/\/company-(\d+)$/)[1]),
    page => ({ state: { profile: { shipments: [{ shipments: [{ BillOfLading: `BOL-${page}` }] }] } } })
  );

  await assert.rejects(fetchShipments('usa', 1, true, REQUEST_OPTIONS), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.RATE_LIMITED);
    assert.match(error.message, /响应累计 3 次/);
    return true;
  });

  assert.equal(get.mock.callCount(), 5);
  assert.deepEqual(requestedPages, [1, 1, 2, 2, 3]);
  assert.equal(writes.length, 2);
  assert.deepEqual(renameTargets.map(filename => path.basename(filename)), ['1.json', '2.json']);
  assert.deepEqual(writes.map(write => JSON.parse(write.contents)), [
    [{ ...importer(1), shipments: [{ BillOfLading: 'BOL-1' }] }],
    [{ ...importer(2), shipments: [{ BillOfLading: 'BOL-2' }] }],
  ]);
});
