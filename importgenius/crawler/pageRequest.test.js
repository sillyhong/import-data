const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { createRequestSession, requestPage } = require('./pageRequest');
const { PAGE_ERROR_CODES } = require('./pageData');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function response(url, status = 200) {
  return {
    status,
    data: status === 429 ? '<html><head><title>Too Many Requests</title></head></html>' : '<html>Profile</html>',
    headers: { 'content-type': 'text/html', 'retry-after': '1', 'set-cookie': 'private-cookie-value' },
    config: { url },
    request: { res: { responseUrl: url } },
  };
}

function limited(url) {
  return Object.assign(new Error('Request failed with status code 429'), {
    code: 'ERR_BAD_REQUEST',
    response: response(url, 429),
  });
}

function retryOptions(delays = []) {
  return {
    maxAttempts: 4,
    baseDelayMs: 0,
    delay: async milliseconds => { delays.push(milliseconds); },
    log: () => {},
  };
}

test('the third HTTP 429 aborts before a fourth attempt and logs sanitized request context', async t => {
  const logs = [];
  const waits = [];
  const session = createRequestSession({ log: message => { logs.push(message); } });
  const url = 'https://request-user:secretpass@www.importgenius.cn/importers/example?token=tokensecret';
  const get = t.mock.method(axios, 'get', async requestUrl => { throw limited(requestUrl); });

  await assert.rejects(requestPage(url, {
    label: '[usa][5][详情]', requestSession: session, retry: retryOptions(waits),
  }), error => {
    assert.equal(error.code, PAGE_ERROR_CODES.RATE_LIMITED);
    assert.equal(session.signal.reason, error);
    return true;
  });

  assert.equal(get.mock.callCount(), 3);
  assert.deepEqual(waits, [1000, 1000]);
  assert.equal(session.rateLimitCount, 3);
  assert.equal(session.signal.aborted, true);
  const output = logs.join('\n');
  assert.match(output, /HTTP\s*429/);
  assert.match(output, /usa/);
  assert.match(output, /详情/);
  assert.match(output, /3/);
  assert.ok(output.includes('https://www.importgenius.cn/importers/example'));
  for (const secret of ['request-user', 'secretpass', 'tokensecret', 'private-cookie-value']) {
    assert.equal(output.includes(secret), false);
  }

  await assert.rejects(requestPage('https://www.importgenius.cn/importers/after-stop', {
    requestSession: session, retry: retryOptions(),
  }), error => error === session.signal.reason);
  assert.equal(get.mock.callCount(), 3);

  const nextSession = createRequestSession({ log: () => {} });
  assert.equal(nextSession.rateLimitCount, 0);
  assert.equal(nextSession.signal.aborted, false);
  assert.doesNotThrow(() => nextSession.assertActive());
});

test('one task accumulates rate limits across importer and shipment requests despite intervening successes', async t => {
  const session = createRequestSession({ log: () => {} });
  const attempts = new Map();
  const get = t.mock.method(axios, 'get', async url => {
    const count = (attempts.get(url) || 0) + 1;
    attempts.set(url, count);
    if (count === 1) throw limited(url);
    return response(url);
  });
  const importerUrl = 'https://www.importgenius.cn/tradebase/browse/importer/latest/1';
  const shipmentUrl = 'https://www.importgenius.cn/importers/first';
  const nextPageUrl = 'https://www.importgenius.cn/tradebase/browse/importer/latest/2';

  assert.equal((await requestPage(importerUrl, {
    label: '[usa][1][列表]', requestSession: session, retry: retryOptions(),
  })).status, 200);
  assert.equal(session.rateLimitCount, 1);
  assert.equal((await requestPage(shipmentUrl, {
    label: '[usa][详情]', requestSession: session, retry: retryOptions(),
  })).status, 200);
  assert.equal(session.rateLimitCount, 2);
  assert.equal(session.signal.aborted, false);

  await assert.rejects(requestPage(nextPageUrl, {
    label: '[usa][2][列表]', requestSession: session, retry: retryOptions(),
  }), error => error.code === PAGE_ERROR_CODES.RATE_LIMITED);
  assert.equal(session.rateLimitCount, 3);
  assert.equal(attempts.get(nextPageUrl), 1);
  assert.equal(get.mock.callCount(), 5);

  const independent = createRequestSession({ log: () => {} });
  const independentUrl = 'https://www.importgenius.cn/importers/new-task';
  assert.equal((await requestPage(independentUrl, {
    label: '[usa][详情]', requestSession: independent, retry: retryOptions(),
  })).status, 200);
  assert.equal(independent.rateLimitCount, 1);
  assert.equal(independent.signal.aborted, false);
  assert.equal(session.rateLimitCount, 3);
});

test('simultaneous rate limits in a four-request batch trigger one shared stop before any retry', async t => {
  const session = createRequestSession({ log: () => {} });
  const get = t.mock.method(axios, 'get', async url => { throw limited(url); });
  const requests = Array.from({ length: 4 }, (_, index) => requestPage(
    `https://www.importgenius.cn/importers/company-${index}`,
    { requestSession: session, retry: retryOptions() }
  ));
  const results = await Promise.allSettled(requests);

  assert.equal(get.mock.callCount(), 4);
  assert.equal(session.rateLimitCount, 3);
  assert.equal(session.signal.aborted, true);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, session.signal.reason);
  }
});

test('the third rate limit cancels an in-flight request and a peer retry wait immediately', { timeout: 2000 }, async t => {
  const session = createRequestSession({ log: () => {} });
  const attempts = new Map();
  const pendingStarted = deferred();
  const retryWaiting = deferred();
  let pendingAborted = false;
  const get = t.mock.method(axios, 'get', (url, options) => {
    const count = (attempts.get(url) || 0) + 1;
    attempts.set(url, count);
    if (url.endsWith('/pending')) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          pendingAborted = true;
          reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }));
        }, { once: true });
        pendingStarted.resolve();
      });
    }
    if (url.endsWith('/waiting')) {
      return Promise.reject(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
    }
    if (url.endsWith('/trigger') || count === 1) return Promise.reject(limited(url));
    return Promise.resolve(response(url));
  });

  for (const suffix of ['prime-one', 'prime-two']) {
    await requestPage(`https://www.importgenius.cn/importers/${suffix}`, {
      requestSession: session, retry: retryOptions(),
    });
  }
  assert.equal(session.rateLimitCount, 2);

  const pending = requestPage('https://www.importgenius.cn/importers/pending', {
    requestSession: session, retry: retryOptions(),
  });
  const waiting = requestPage('https://www.importgenius.cn/importers/waiting', {
    requestSession: session,
    retry: {
      ...retryOptions(),
      delay: () => {
        retryWaiting.resolve();
        return new Promise(() => {});
      },
    },
  });
  const observePeers = Promise.allSettled([pending, waiting]);
  await Promise.all([pendingStarted.promise, retryWaiting.promise]);
  const trigger = requestPage('https://www.importgenius.cn/importers/trigger', {
    requestSession: session, retry: retryOptions(),
  });
  await assert.rejects(trigger, error => error === session.signal.reason);
  const results = await observePeers;

  assert.equal(session.rateLimitCount, 3);
  assert.equal(pendingAborted, true);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, session.signal.reason);
  }
  assert.equal(attempts.get('https://www.importgenius.cn/importers/waiting'), 1);
  assert.equal(get.mock.callCount(), 7);
});
