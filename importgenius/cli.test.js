const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
const cli = path.join(__dirname, 'cli.js');
const options = { env: { ...process.env, TASK_ENV: 'local' }, timeout: 5000 };

test('CLI help describes explicit batch selection and retained snapshots without connecting to MySQL', async () => {
  const result = await run(process.execPath, [cli, '--help'], options);
  assert.match(result.stdout, /--batch <采集批次>/);
  assert.match(result.stdout, /同日执行互不覆盖/);
  assert.match(result.stdout, /fetch-shipments \/ import 必须指定 --batch/);
});

test('CLI rejects ambiguous inputs and snapshot deletion before starting any task', async t => {
  for (const [args, message] of [
    [['fetch-importers', '--country', 'usa'], /新采集必须指定 --pages/],
    [['fetch-shipments', '--pages', '1'], /请使用 --batch/],
    [['import', '--pages', '1'], /请使用 --batch/],
    [['sync', '--pages', '1', '--cleanup'], /不再支持 --cleanup/],
    [['sync', '--batch', '20261026/103025-aaaaaaaa', '--refresh'], /不能与 --refresh/],
    [['import', '--batch', '../../outside'], /采集批次格式无效/],
  ]) {
    await t.test(args.join(' '), async () => {
      await assert.rejects(run(process.execPath, [cli, ...args], options), error => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, message);
        assert.doesNotMatch(error.stdout, /通过 server\/task-runner/);
        return true;
      });
    });
  }
});
