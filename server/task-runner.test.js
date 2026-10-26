const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const cron = require('node-cron');
const importGeniusDb = require('../importgenius/database/db');
const importYetiDb = require('../importyeti/database/db');
const batchStorage = require('../importgenius/storage/batches');

const TASK = 'importgenius.fetch-importers';
const NEXT_TASK = 'importgenius.fetch-shipments';
const runnerPath = require.resolve('./task-runner');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.pid = 4242;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.signals = [];
  }

  kill(signal) {
    this.killed = true;
    this.signals.push(signal);
    return true;
  }

  close(code, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('close', code, signal);
  }
}

function harness(t, { acquireGate, acquireStarted, releaseGate, spawnError, batchError, batchGate, batchStarted } = {}) {
  const previousEnvironment = process.env.TASK_ENV;
  process.env.TASK_ENV = 'local';
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.TASK_ENV;
    else process.env.TASK_ENV = previousEnvironment;
    delete require.cache[runnerPath];
  });
  const children = [];
  const connections = [];
  const timers = [];
  t.mock.method(global, 'setTimeout', (callback, milliseconds) => {
    const timer = { callback, milliseconds, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  });
  t.mock.method(global, 'clearTimeout', timer => { if (timer) timer.cleared = true; });
  const schedule = t.mock.method(cron, 'schedule', () => ({ start() {}, stop() {} }));
  const openBatch = t.mock.method(batchStorage, 'openBatch', async () => {
    batchStarted?.resolve();
    if (batchGate) await batchGate.promise;
    if (batchError) throw batchError;
    return {};
  });
  const spawn = t.mock.method(childProcess, 'spawn', () => {
    if (spawnError) throw spawnError;
    const child = new FakeChild();
    children.push(child);
    return child;
  });
  const pool = {
    async getConnection() {
      const connection = {
        releaseCount: 0,
        queries: [],
        async execute(sql) {
          this.queries.push(sql);
          if (sql.includes('GET_LOCK')) {
            acquireStarted?.resolve();
            if (acquireGate) await acquireGate.promise;
            return [[{ acquired: 1 }]];
          }
          if (sql.includes('RELEASE_LOCK')) {
            if (releaseGate) await releaseGate.promise;
            return [[{ released: 1 }]];
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        release() { this.releaseCount += 1; },
      };
      connections.push(connection);
      return connection;
    },
  };
  t.mock.method(importGeniusDb, 'getPool', () => pool);
  t.mock.method(importYetiDb, 'getPool', () => pool);
  delete require.cache[runnerPath];
  const runner = require('./task-runner');
  return { runner, children, connections, timers, spawn, schedule, openBatch };
}

test('manual stop holds the active slot and database lock until the child closes and lock release finishes', async t => {
  const releaseGate = deferred();
  const { runner, children, connections } = harness(t, { releaseGate });
  const started = await runner.runTask(TASK);
  children[0].stdout.emit('data', Buffer.from('checkpoint saved\n'));
  const completion = runner.waitForRun(TASK, started.runId);
  let completed = false;
  completion.then(() => { completed = true; });

  const stopping = await runner.stopTask(TASK, started.runId);
  assert.equal(stopping.status, 'stopping');
  assert.deepEqual(children[0].signals, ['SIGTERM']);
  assert.equal(runner.getCatalog().activeRunId, started.runId);
  await assert.rejects(runner.runTask(NEXT_TASK), error => error.status === 409);
  assert.equal(connections[0].releaseCount, 0);

  children[0].close(null, 'SIGTERM');
  await flush();
  assert.equal(completed, false);
  assert.equal(connections[0].releaseCount, 0);
  assert.equal(runner.getCatalog().activeRunId, started.runId);
  await assert.rejects(runner.runTask(NEXT_TASK), error => error.status === 409);

  releaseGate.resolve();
  const stopped = await completion;
  assert.equal(stopped.status, 'stopped');
  assert.ok(stopped.finishedAt);
  assert.equal(typeof stopped.durationMs, 'number');
  assert.ok(stopped.logs.some(line => line.text.includes('checkpoint saved')));
  assert.ok(stopped.logs.some(line => /终止|SIGTERM/.test(line.text)));
  assert.equal(connections[0].releaseCount, 1);
  assert.equal(runner.getCatalog().activeRunId, null);
});

test('repeated or terminal stop requests cannot terminate a later run and mismatched identities return 404', async t => {
  const { runner, children } = harness(t);
  const first = await runner.runTask(TASK);
  await assert.rejects(runner.stopTask(NEXT_TASK, first.runId), error => error.status === 404);
  await assert.rejects(runner.stopTask(TASK, 'unknown-run'), error => error.status === 404);
  await runner.stopTask(TASK, first.runId);
  assert.equal((await runner.stopTask(TASK, first.runId)).status, 'stopping');
  assert.deepEqual(children[0].signals, ['SIGTERM']);
  children[0].close(null, 'SIGTERM');
  await runner.waitForRun(TASK, first.runId);

  const second = await runner.runTask(NEXT_TASK, { country: 'usa', pages: [1], batchId: 'legacy' });
  assert.equal((await runner.stopTask(TASK, first.runId)).status, 'stopped');
  assert.equal(children[1].signals.length, 0);
  assert.equal(runner.getCatalog().activeRunId, second.runId);
  children[1].close(0);
  assert.equal((await runner.waitForRun(NEXT_TASK, second.runId)).status, 'success');
});

test('manual stop escalates to SIGKILL after the grace period without releasing the active slot early', async t => {
  const { runner, children, timers, connections } = harness(t);
  const started = await runner.runTask(TASK);
  await runner.stopTask(TASK, started.runId);
  const grace = timers.find(timer => timer.milliseconds === 10000 && !timer.cleared);
  assert.ok(grace, 'a stop grace timer must be scheduled');
  grace.callback();
  assert.deepEqual(children[0].signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(connections[0].releaseCount, 0);
  assert.equal(runner.getCatalog().activeRunId, started.runId);

  children[0].close(null, 'SIGKILL');
  const stopped = await runner.waitForRun(TASK, started.runId);
  assert.equal(stopped.status, 'stopped');
  assert.ok(stopped.logs.some(line => /SIGKILL|强制/.test(line.text)));
  assert.equal(grace.cleared, true);
  assert.equal(connections[0].releaseCount, 1);
});

test('a stop requested during lock acquisition prevents spawning and still releases the acquired lock', async t => {
  const acquireGate = deferred();
  const acquireStarted = deferred();
  const { runner, connections, spawn } = harness(t, { acquireGate, acquireStarted });
  const starting = runner.runTask(TASK);
  await acquireStarted.promise;
  const runId = runner.getCatalog().activeRunId;
  assert.ok(runId);
  assert.equal((await runner.stopTask(TASK, runId)).status, 'stopping');
  assert.equal(spawn.mock.callCount(), 0);
  acquireGate.resolve();

  const stopped = await starting;
  assert.equal(stopped.status, 'stopped');
  assert.equal((await runner.waitForRun(TASK, runId)).status, 'stopped');
  assert.equal(spawn.mock.callCount(), 0);
  assert.equal(connections[0].releaseCount, 1);
  assert.equal(runner.getCatalog().activeRunId, null);
});

test('a worker that already exited naturally is not relabeled as manually stopped before close', async t => {
  const { runner, children } = harness(t);
  const started = await runner.runTask(TASK);
  children[0].exitCode = 0;
  children[0].emit('exit', 0, null);
  await runner.stopTask(TASK, started.runId);
  assert.deepEqual(children[0].signals, []);
  children[0].close(0);
  const completed = await runner.waitForRun(TASK, started.runId);
  assert.equal(completed.status, 'success');
});

test('runtime timeout remains a failed run rather than a manual stop', async t => {
  const { runner, children, timers } = harness(t);
  const started = await runner.runTask(TASK);
  const timeout = timers.find(timer => timer.milliseconds >= 60000 && !timer.cleared);
  assert.ok(timeout);
  timeout.callback();
  assert.deepEqual(children[0].signals, ['SIGTERM']);
  children[0].close(null, 'SIGTERM');
  const failed = await runner.waitForRun(TASK, started.runId);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /超过|超时/);
  assert.equal((await runner.stopTask(TASK, started.runId)).status, 'failed');
  assert.deepEqual(children[0].signals, ['SIGTERM']);
});

test('an asynchronous spawn error and later close release resources and complete only once', async t => {
  const { runner, children, connections } = harness(t);
  const started = await runner.runTask(TASK);
  children[0].pid = undefined;
  children[0].emit('error', new Error('spawn EACCES'));
  children[0].close(-13);
  const failed = await runner.waitForRun(TASK, started.runId);
  await flush();
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /EACCES/);
  assert.equal(connections[0].releaseCount, 1);
  assert.equal(runner.getCatalog().activeRunId, null);
});

test('a synchronous spawn failure still releases the lock and reports failure', async t => {
  const { runner, connections } = harness(t, { spawnError: new Error('spawn unavailable') });
  const failed = await runner.runTask(TASK);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /spawn unavailable/);
  assert.equal(connections[0].releaseCount, 1);
  assert.equal(runner.getCatalog().activeRunId, null);
});

test('new manual list runs receive distinct batch IDs and resume keeps the selected batch identity', async t => {
  const { runner, children, spawn } = harness(t);
  const first = await runner.runTask(TASK, { country: 'USA', pages: [2, 1, 1] });
  const firstParams = JSON.parse(spawn.mock.calls[0].arguments[1][2]);
  assert.match(first.batchId, /^\d{8}\/\d{6}-[a-f0-9]{8}$/);
  assert.equal(first.batchMode, 'new');
  assert.equal(firstParams.batchId, first.batchId);
  assert.equal(firstParams.batchSource, 'manual');
  assert.deepEqual(firstParams.pages, [1, 2]);
  children[0].close(0);
  await runner.waitForRun(TASK, first.runId);

  const second = await runner.runTask(TASK, { country: 'usa', pages: [1] });
  assert.notEqual(second.batchId, first.batchId);
  children[1].close(0);
  await runner.waitForRun(TASK, second.runId);

  const resumed = await runner.runTask('importgenius.full-sync', { country: 'usa', pages: [1], batchId: first.batchId });
  const resumeParams = JSON.parse(spawn.mock.calls[2].arguments[1][2]);
  assert.equal(resumed.batchId, first.batchId);
  assert.equal(resumed.batchMode, 'resume');
  assert.equal(resumeParams.batchMode, 'resume');
  assert.deepEqual(resumeParams.countries, ['usa']);
  children[2].close(0);
  await runner.waitForRun('importgenius.full-sync', resumed.runId);
});

test('weekly collection launches the same full workflow with one new batch and independent fixed scope', async t => {
  const { runner, children, spawn, schedule } = harness(t);
  assert.equal(schedule.mock.calls[0].arguments[0], '0 0 * * 0');
  assert.equal(schedule.mock.calls[0].arguments[2].timezone, 'Asia/Shanghai');
  await schedule.mock.calls[0].arguments[1]();
  const args = spawn.mock.calls[0].arguments[1];
  const params = JSON.parse(args[2]);
  assert.equal(args[1], 'importgenius.full-sync');
  assert.equal(params.batchMode, 'new');
  assert.equal(params.batchSource, 'scheduled');
  assert.match(params.batchId, /^\d{8}\/\d{6}-[a-f0-9]{8}$/);
  assert.deepEqual(params.countries, ['usa']);
  assert.deepEqual(params.pages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(Object.hasOwn(params, 'refreshList'), false);
  assert.equal(Object.hasOwn(params, 'cleanup'), false);
  const scheduledRunId = runner.getCatalog().scheduler.activeRunId;
  children[0].close(0);
  await runner.waitForRun('importgenius.full-sync', scheduledRunId);
});

test('invalid batch selectors and automatic cleanup are rejected without creating a child', async t => {
  const { runner, spawn } = harness(t);
  await assert.rejects(runner.runTask(TASK, { batchId: '../other-batch' }), error => error.status === 400);
  await assert.rejects(runner.runTask('importgenius.full-sync', { country: 'usa', pages: [1], cleanup: true }), error => error.status === 400);
  assert.equal(spawn.mock.callCount(), 0);
});

test('direct runner callers must select an available batch before detail or import workers can start', async t => {
  const { runner, spawn, openBatch } = harness(t, { batchError: Object.assign(new Error('采集批次不存在。'), { status: 404 }) });
  await assert.rejects(runner.runTask(NEXT_TASK, { country: 'usa', pages: [1] }), error => error.status === 400);
  await assert.rejects(runner.runTask('importgenius.full-sync', { country: 'usa', pages: [1], batchId: '20261026/103025-a7f31234' }), error => error.status === 404);
  assert.deepEqual(openBatch.mock.calls[0].arguments, ['usa', '20261026/103025-a7f31234', { pages: [1], environment: 'local' }]);
  assert.equal(spawn.mock.callCount(), 0);
  assert.equal(runner.getCatalog().activeRunId, null);
});

test('resumed batch validation holds the active slot so concurrent requests cannot both start', async t => {
  const batchGate = deferred();
  const batchStarted = deferred();
  const { runner, spawn, children } = harness(t, { batchGate, batchStarted });
  const starting = runner.runTask(NEXT_TASK, { country: 'usa', pages: [1], batchId: 'legacy' });
  await batchStarted.promise;
  const runId = runner.getCatalog().activeRunId;
  assert.ok(runId);
  await assert.rejects(runner.runTask(TASK, { country: 'usa', pages: [1] }), error => error.status === 409);
  assert.equal(spawn.mock.callCount(), 0);
  batchGate.resolve();
  const started = await starting;
  assert.equal(started.runId, runId);
  children[0].close(0);
  await runner.waitForRun(NEXT_TASK, runId);
});
