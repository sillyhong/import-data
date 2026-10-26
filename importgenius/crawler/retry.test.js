const test = require('node:test');
const assert = require('node:assert/strict');
const { withRetry } = require('./retry');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function connectionReset() {
  return Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
}

test('an already aborted retry scope never starts an operation and preserves its stop reason', async () => {
  const controller = new AbortController();
  const reason = new Error('task rate limit exceeded');
  controller.abort(reason);
  let attempts = 0;

  await assert.rejects(withRetry('stopped request', async () => { attempts += 1; }, {
    signal: controller.signal,
    log: () => {},
  }), error => error === reason);
  assert.equal(attempts, 0);
});

test('aborting the default retry delay stops immediately and prevents a second attempt', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  const reason = new Error('stop all requests');
  const waiting = deferred();
  let attempts = 0;
  const running = withRetry('waiting request', async () => {
    attempts += 1;
    throw connectionReset();
  }, {
    signal: controller.signal,
    maxAttempts: 4,
    baseDelayMs: 10000,
    log: () => { waiting.resolve(); },
  });
  const observed = running.catch(error => error);
  await waiting.promise;
  controller.abort(reason);

  assert.equal(await observed, reason);
  assert.equal(attempts, 1);
});

test('aborting an injected unresolved retry wait rejects with the shared reason', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  const reason = new Error('stop all requests');
  const waiting = deferred();
  let attempts = 0;
  const running = withRetry('custom waiting request', async () => {
    attempts += 1;
    throw connectionReset();
  }, {
    signal: controller.signal,
    maxAttempts: 4,
    delay: () => {
      waiting.resolve();
      return new Promise(() => {});
    },
    log: () => {},
  });
  const observed = running.catch(error => error);
  await waiting.promise;
  controller.abort(reason);

  assert.equal(await observed, reason);
  assert.equal(attempts, 1);
});
