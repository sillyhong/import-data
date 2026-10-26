const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTaskLogStore } = require('./task-logs');

test('customer development records remain searchable with their category and full output', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'robot-log-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createTaskLogStore({ directory });
  for (const taskId of ['robot.inspect', 'importyeti.status']) {
    const record = await store.createRecord({
      taskId, taskName: taskId, environment: 'local', triggerType: 'manual',
      params: {}, status: 'running', startedAt: new Date().toISOString(),
    });
    await record.append('stdout', 'fixture summary only\n');
    await record.update({ status: 'success', finishedAt: new Date().toISOString(), exitCode: 0 });
    await record.flush();
  }
  const result = await store.listRecords({ category: 'robot' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].taskId, 'robot.inspect');
  assert.equal(result.items[0].categoryLabel, '客户开发');
  assert.ok(result.facets.categories.some(item => item.value === 'robot' && item.label === '客户开发'));
  const detail = await store.getRecord(result.items[0].id);
  assert.equal(detail.category, 'robot');
  const output = await store.readOutput(result.items[0].id);
  assert.equal(output.items.length, 1);
  assert.match(output.items[0].text, /fixture summary/);
});
