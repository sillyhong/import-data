const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const axios = require('axios');
const { fetchSinglePage, fetchProfileShipments } = require('./fetchShipments');
const { PAGE_ERROR_CODES } = require('./pageData');

const REQUEST_OPTIONS = { batchDelayMs: 0, retry: { maxAttempts: 1 } };
const VERIFICATION_HTML = '<html><head><title>Browser verification</title></head><body><script>document.cookie="EO_Bot_Ssid=challenge";</script></body></html>';

function importer(name) {
  return { company: `${name} importer`, url: `importers/${name}` };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function htmlResponse(url, data, status = 200, headers = {}) {
  return {
    status,
    data,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
    config: { url },
    request: { res: { responseUrl: url } },
  };
}

function requestError(response) {
  return Object.assign(new Error(`Request failed with status code ${response.status}`), {
    code: 'ERR_BAD_REQUEST',
    response,
  });
}

function shipmentHtml(shipments) {
  const payload = { state: { profile: { shipments: [{ shipments }] } } };
  return `<html><head><title>Importer profile</title></head><body><script>window.__NUXT__ = ${JSON.stringify(payload)};</script></body></html>`;
}

function mockCheckpoint(t, records) {
  const writes = [];
  t.mock.method(fs, 'readFile', async () => JSON.stringify(records));
  t.mock.method(fs, 'mkdir', async () => {});
  t.mock.method(fs, 'writeFile', async (filename, contents) => {
    writes.push({ filename, contents });
  });
  const rename = t.mock.method(fs, 'rename', async () => {});
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  return { writes, rename };
}

test('finishes the current batch after an HTTP 200 verification page without starting another batch', async t => {
  const { writes } = mockCheckpoint(t, ['first', 'second', 'third', 'fourth', 'fifth'].map(importer));
  const get = t.mock.method(axios, 'get', async url => htmlResponse(url, VERIFICATION_HTML));

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.BLOCKED);
    assert.match(error.message, /HTTP 200/);
    assert.match(error.message, /checkpoint/);
    return true;
  });

  assert.equal(get.mock.callCount(), 2);
  assert.equal(writes.length, 0);
});

test('stops before the next batch on HTTP 403 and reports response diagnostics', async t => {
  const { writes } = mockCheckpoint(t, ['first', 'second', 'third', 'fourth', 'fifth'].map(importer));
  const get = t.mock.method(axios, 'get', async url => {
    throw requestError(htmlResponse(url, '<html><head><title>Forbidden</title></head><body>Access denied</body></html>', 403));
  });

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.ACCESS_DENIED);
    assert.match(error.message, /HTTP 403/);
    assert.match(error.message, /Forbidden/);
    assert.match(error.message, /https:\/\/www\.importgenius\.cn\/importers\/first/);
    return true;
  });

  assert.equal(get.mock.callCount(), 2);
  assert.equal(writes.length, 0);
});

test('stops after the current batch exhausts HTTP 429 retries without requesting remaining importers', async t => {
  const { writes } = mockCheckpoint(t, ['first', 'second', 'third', 'fourth', 'fifth'].map(importer));
  const get = t.mock.method(axios, 'get', async url => {
    throw requestError(htmlResponse(url, '<html><head><title>Too Many Requests</title></head></html>', 429, { 'retry-after': '120' }));
  });

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.RATE_LIMITED);
    assert.match(error.message, /HTTP 429/);
    return true;
  });

  assert.equal(get.mock.callCount(), 2);
  assert.equal(writes.length, 0);
});

test('retries a transient HTTP 429 successfully before classifying it as a terminal access error', async t => {
  const shipment = {
    BillOfLading: 'BOL-AFTER-RETRY',
    ProductDescription: ['HINGE'],
    mostRecentDate: '2026-10-08 08:00:00',
  };
  const delays = [];
  let attempts = 0;
  t.mock.method(console, 'log', () => {});
  const get = t.mock.method(axios, 'get', async url => {
    attempts += 1;
    if (attempts === 1) {
      throw requestError(htmlResponse(url, '<html><head><title>Too Many Requests</title></head></html>', 429, { 'retry-after': '1' }));
    }
    return htmlResponse(url, shipmentHtml([shipment]));
  });

  const result = await fetchProfileShipments('usa', importer('first'), {
    retry: {
      maxAttempts: 2,
      baseDelayMs: 0,
      delay: async milliseconds => { delays.push(milliseconds); },
      log: () => {},
    },
  });

  assert.equal(get.mock.callCount(), 2);
  assert.deepEqual(delays, [1000]);
  assert.deepEqual(result, [shipment]);
});

test('checkpoints successes from the same batch as a verification failure before stopping further requests', async t => {
  const { writes, rename } = mockCheckpoint(t, ['first', 'second', 'third', 'fourth', 'fifth'].map(importer));
  const shipment = { BillOfLading: 'BOL-001', ProductDescription: ['DOOR HINGE'] };
  const get = t.mock.method(axios, 'get', async url => htmlResponse(
    url,
    url.endsWith('/second') ? shipmentHtml([shipment]) : VERIFICATION_HTML
  ));

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.BLOCKED);
    assert.match(error.message, /已完成 1\/5/);
    return true;
  });

  assert.equal(get.mock.callCount(), 2);
  assert.equal(writes.length, 1);
  assert.equal(rename.mock.callCount(), 1);
  const checkpoint = JSON.parse(writes[0].contents);
  assert.deepEqual(checkpoint[1].shipments, [shipment]);
  for (const index of [0, 2, 3, 4]) assert.equal(Object.hasOwn(checkpoint[index], 'shipments'), false);
  assert.match(rename.mock.calls[0].arguments[1], /\/usa\/1\.json$/);
});

test('continues after an isolated missing payload and checkpoints a later successful importer', async t => {
  const { writes } = mockCheckpoint(t, [importer('first'), importer('second')]);
  const shipment = { BillOfLading: 'BOL-002', ProductDescription: ['SHOWER DOOR'] };
  const get = t.mock.method(axios, 'get', async url => htmlResponse(
    url,
    url.endsWith('/first')
      ? '<html><head><title>Unavailable profile</title></head><body>Profile unavailable</body></html>'
      : shipmentHtml([shipment])
  ));

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.match(error.message, /详情抓取有 1 家失败/);
    assert.match(error.message, /本次新增 1 家详情/);
    assert.equal(error.failedDetails.length, 1);
    assert.equal(error.failedDetails[0].code, PAGE_ERROR_CODES.MISSING);
    return true;
  });

  assert.equal(get.mock.callCount(), 2);
  assert.equal(writes.length, 1);
  const checkpoint = JSON.parse(writes[0].contents);
  assert.equal(Object.hasOwn(checkpoint[0], 'shipments'), false);
  assert.deepEqual(checkpoint[1].shipments, [shipment]);
});

test('finishes the current batch of consecutive missing payloads and stops before the fifth importer', async t => {
  const { writes } = mockCheckpoint(t, ['first', 'second', 'third', 'fourth', 'fifth'].map(importer));
  const get = t.mock.method(axios, 'get', async url => htmlResponse(
    url,
    '<html><head><title>Unavailable profile</title></head><body>Profile unavailable</body></html>'
  ));

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.MISSING);
    assert.equal(error.failedDetails.length, 4);
    assert.match(error.message, /剩余记录未继续请求/);
    return true;
  });

  assert.equal(get.mock.callCount(), 4);
  assert.equal(writes.length, 0);
});

test('a success after three missing payloads clears the error streak and allows the next batch', async t => {
  const { writes } = mockCheckpoint(t, ['first', 'second', 'third', 'fourth', 'fifth'].map(importer));
  const shipment = { BillOfLading: 'BOL-RECOVERED', ProductDescription: ['GLASS DOOR'] };
  const get = t.mock.method(axios, 'get', async url => htmlResponse(
    url,
    /\/(fourth|fifth)$/.test(url)
      ? shipmentHtml([shipment])
      : '<html><head><title>Unavailable profile</title></head></html>'
  ));

  await assert.rejects(fetchSinglePage('usa', 1, REQUEST_OPTIONS), error => {
    assert.match(error.message, /详情抓取有 3 家失败/);
    assert.match(error.message, /本次新增 2 家详情/);
    assert.equal(error.failedDetails.length, 3);
    return true;
  });

  assert.equal(get.mock.callCount(), 5);
  assert.equal(writes.length, 2);
  const checkpoint = JSON.parse(writes[1].contents);
  assert.deepEqual(checkpoint[3].shipments, [shipment]);
  assert.deepEqual(checkpoint[4].shipments, [shipment]);
  for (const record of checkpoint.slice(0, 3)) assert.equal(Object.hasOwn(record, 'shipments'), false);
});

test('runs at most two concurrent requests and starts the next batch only after both settle', { timeout: 3000 }, async t => {
  const { writes } = mockCheckpoint(t, Array.from({ length: 4 }, (_, index) => importer(`company-${index + 1}`)));
  const shipment = { BillOfLading: 'BOL-BATCH', ProductDescription: ['HINGE'] };
  const firstBatchStarted = deferred();
  const secondBatchStarted = deferred();
  const gates = [];
  let active = 0;
  let peak = 0;
  let releaseRemaining = false;
  const get = t.mock.method(axios, 'get', url => {
    active += 1;
    peak = Math.max(peak, active);
    const gate = deferred();
    gates.push({ ...gate, url });
    if (gates.length === 2) firstBatchStarted.resolve();
    if (gates.length === 4) secondBatchStarted.resolve();
    if (releaseRemaining) gate.resolve(htmlResponse(url, shipmentHtml([shipment])));
    return gate.promise.finally(() => { active -= 1; });
  });
  const running = fetchSinglePage('usa', 1, REQUEST_OPTIONS);

  try {
    await firstBatchStarted.promise;
    assert.equal(get.mock.callCount(), 2);
    assert.equal(active, 2);

    gates[0].resolve(htmlResponse(gates[0].url, shipmentHtml([shipment])));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(active, 1);
    assert.equal(get.mock.callCount(), 2);

    gates[1].resolve(htmlResponse(gates[1].url, shipmentHtml([shipment])));
    await secondBatchStarted.promise;
    assert.equal(get.mock.callCount(), 4);
    assert.equal(active, 2);
    assert.equal(peak, 2);

    for (const gate of gates.slice(2)) gate.resolve(htmlResponse(gate.url, shipmentHtml([shipment])));
    const result = await running;
    assert.equal(result.fetched, 4);
    assert.equal(writes.length, 2);
    assert.equal(active, 0);
  } finally {
    releaseRemaining = true;
    for (const gate of gates) gate.resolve(htmlResponse(gate.url, shipmentHtml([shipment])));
    await running.catch(() => {});
  }
});
