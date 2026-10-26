const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  createBatchId, validateBatchId, createBatch, openBatch, pagePath, setPageStage, listBatches,
} = require('./batches');

const FIRST = '20261026/103025-a7f30001';
const SECOND = '20261026/103025-a7f30002';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'importgenius-batches-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, dataRoot: path.join(directory, 'data'), environment: 'local' };
}

test('batch IDs use Shanghai date and unique same-second suffixes', () => {
  const date = new Date('2026-10-25T16:00:00Z');
  const first = createBatchId(date);
  const second = createBatchId(date);
  assert.match(first, /^20261026\/000000-[0-9a-f]{8}$/);
  assert.notEqual(first, second);
  assert.equal(validateBatchId(first), first);
  assert.equal(validateBatchId('legacy'), 'legacy');
  assert.throws(() => createBatchId(new Date('invalid')), { status: 400 });
});

test('batch IDs reject traversal and invalid calendar dates or times', () => {
  for (const value of ['../x', '20261026/../x', '/20261026/103025-a7f30001', '20260230/103025-a7f30001',
    '20261026/240000-a7f30001', '20261026/106025-a7f30001', '20261026/103025-A7F30001',
    '20261026\\103025-a7f30001', 'legacy/x', null]) {
    assert.throws(() => validateBatchId(value), { status: 400 }, String(value));
  }
});

test('same-day batches keep separate pages and exclusive manifests', async t => {
  const options = await fixture(t);
  const first = await createBatch('usa', [2, 1, 1], { ...options, batchId: FIRST });
  const second = await createBatch('usa', [1], { ...options, batchId: SECOND });
  assert.deepEqual(first.pages, [1, 2]);
  assert.equal(first.manifest.schemaVersion, 1);
  await fs.writeFile(pagePath(first, 1), '[{"company":"first"}]');
  await fs.writeFile(pagePath(second, 1), '[{"company":"second"}]');
  assert.equal(JSON.parse(await fs.readFile(pagePath(first, 1), 'utf8'))[0].company, 'first');
  await assert.rejects(createBatch('usa', [3], { ...options, batchId: FIRST }), { status: 409 });
  await assert.rejects(createBatch('usa', [1], { ...options, batchId: 'legacy' }), { status: 400 });
});

test('simultaneous batch creation has one owner', async t => {
  const options = await fixture(t);
  const results = await Promise.allSettled([
    createBatch('usa', [1], { ...options, batchId: FIRST }),
    createBatch('usa', [1], { ...options, batchId: FIRST }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
});

test('batch creation never takes ownership of an existing orphan directory or its JSON', async t => {
  const options = await fixture(t);
  const directory = path.join(options.dataRoot, 'usa', ...FIRST.split('/'));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, '1.json'), '[{"company":"orphan history"}]');
  await assert.rejects(createBatch('usa', [1], { ...options, batchId: FIRST }), { status: 409 });
  assert.equal(await fs.readFile(path.join(directory, '1.json'), 'utf8'), '[{"company":"orphan history"}]');
  await assert.rejects(fs.stat(path.join(directory, 'manifest.json')), { code: 'ENOENT' });
});

test('open resumes the original batch across days with an explicit page subset', async t => {
  const options = await fixture(t);
  const originalId = createBatchId(new Date('2026-10-25T15:59:59Z'));
  await createBatch('usa', [1, 2, 3], { ...options, batchId: originalId });
  const resumed = await openBatch('usa', originalId, { ...options, pages: [3, 1] });
  assert.equal(resumed.batchId, originalId);
  assert.deepEqual(resumed.pages, [1, 3]);
  assert.deepEqual(resumed.manifest.pages, [1, 2, 3]);
  assert.match(resumed.directory, /20261025[\/]235959-[0-9a-f]{8}$/);
  await assert.rejects(openBatch('usa', originalId, { ...options, pages: [4] }), { status: 400 });
  await assert.rejects(openBatch('usa', originalId, { ...options, environment: 'production' }), { status: 409 });
  await assert.rejects(openBatch('usa', SECOND, options), { status: 404 });
  await assert.rejects(fs.stat(path.join(options.dataRoot, 'usa', ...SECOND.split('/'))), { code: 'ENOENT' });
  assert.throws(() => pagePath(resumed, 2), { status: 400 });
});

test('stage updates serialize concurrent changes and retain list capture metadata on failure', async t => {
  const options = await fixture(t);
  const batch = await createBatch('usa', [1, 2], { ...options, batchId: FIRST });
  const capturedAt = '2026-10-26T02:30:25.000Z';
  await setPageStage(batch, 1, 'list', 'success', { count: 91, capturedAt });
  await Promise.all([
    setPageStage(batch, 1, 'details', 'running'),
    setPageStage(batch, 2, 'list', 'success', { count: 94 }),
    setPageStage(batch, 1, 'import', 'success', { count: 91 }),
  ]);
  const failed = await setPageStage(batch, 1, 'list', 'failed', { error: new Error('missing original page') });
  assert.equal(failed.capturedAt, capturedAt);
  assert.equal(failed.count, 91);
  assert.equal(failed.error, 'missing original page');
  assert.ok(failed.startedAt);
  assert.ok(failed.finishedAt);
  const disk = JSON.parse(await fs.readFile(path.join(batch.directory, 'manifest.json'), 'utf8'));
  assert.equal(disk.pageStates[1].details.status, 'running');
  assert.equal(disk.pageStates[1].import.status, 'success');
  assert.equal(disk.pageStates[2].list.count, 94);
  assert.deepEqual(batch.manifest, disk);
  await assert.rejects(setPageStage(batch, 1, 'arbitrary', 'success'), { status: 400 });
  await assert.rejects(setPageStage(batch, 1, 'details', 'success', { count: -1 }), { status: 400 });
  assert.deepEqual((await fs.readdir(batch.directory)).filter(name => name.endsWith('.tmp')), []);
});

test('legacy batches list file names without parsing data or inventing capture dates', async t => {
  const options = await fixture(t);
  const countryDirectory = path.join(options.dataRoot, 'usa');
  await fs.mkdir(countryDirectory, { recursive: true });
  await fs.writeFile(path.join(countryDirectory, '2.json'), 'not valid JSON, never parsed for discovery');
  await fs.writeFile(path.join(countryDirectory, '1.json'), '[]');
  await fs.writeFile(path.join(countryDirectory, 'notes.json'), '{}');
  const legacy = await openBatch('usa', 'legacy', options);
  assert.deepEqual(legacy.pages, [1, 2]);
  assert.equal(legacy.manifest.createdAt, null);
  assert.equal(legacy.manifest.environment, 'unknown');
  await setPageStage(legacy, 1, 'import', 'success', { count: 0 });
  await assert.rejects(fs.stat(path.join(countryDirectory, 'manifest.json')), { code: 'ENOENT' });
  await assert.rejects(openBatch('usa', 'legacy', { ...options, pages: [3] }), { status: 404 });
  const [summary] = await listBatches('usa', { ...options, environment: 'production' });
  assert.equal(summary.batchId, 'legacy');
  assert.deepEqual(summary.progress, { list: 2, details: null, import: null });
  assert.equal(summary.createdAt, null);
});

test('batch summaries filter environments and skip damaged manifests with a diagnostic', async t => {
  const options = await fixture(t);
  const first = await createBatch('usa', [1, 2], { ...options, batchId: FIRST });
  await setPageStage(first, 1, 'list', 'success', { count: 91 });
  await createBatch('usa', [1], { ...options, batchId: SECOND, environment: 'production' });
  const brokenId = '20261027/103025-a7f30003';
  const broken = await createBatch('usa', [1], { ...options, batchId: brokenId });
  await fs.writeFile(path.join(broken.directory, 'manifest.json'), '{');
  const warnings = [];
  t.mock.method(console, 'warn', value => warnings.push(value));
  const summaries = await listBatches('usa', options);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].batchId, FIRST);
  assert.equal(summaries[0].totalPages, 2);
  assert.deepEqual(summaries[0].progress, { list: 1, details: 0, import: 0 });
  assert.ok(warnings.some(warning => warning.includes(brokenId)));
});

test('paths reject traversal, symlink country roots, date folders and page files', async t => {
  const options = await fixture(t);
  await fs.mkdir(options.dataRoot, { recursive: true });
  const outside = path.join(options.directory, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(options.dataRoot, 'usa'), 'dir');
  await assert.rejects(createBatch('usa', [1], { ...options, batchId: FIRST }), { status: 400 });
  await fs.unlink(path.join(options.dataRoot, 'usa'));
  await fs.mkdir(path.join(options.dataRoot, 'usa'));
  await fs.symlink(outside, path.join(options.dataRoot, 'usa', '20261026'), 'dir');
  await assert.rejects(createBatch('usa', [1], { ...options, batchId: FIRST }), { status: 400 });
  await fs.unlink(path.join(options.dataRoot, 'usa', '20261026'));
  const batch = await createBatch('usa', [1], { ...options, batchId: FIRST });
  await fs.writeFile(path.join(outside, 'sensitive.json'), 'private');
  await fs.symlink(path.join(outside, 'sensitive.json'), path.join(batch.directory, '1.json'));
  assert.throws(() => pagePath(batch, 1), { status: 400 });
  await assert.rejects(setPageStage(batch, 1, 'details', 'running'), { status: 400 });
  assert.throws(() => pagePath({ ...batch, directory: outside }, 1), { status: 400 });
  await assert.rejects(createBatch('../usa', [1], { ...options, batchId: SECOND }), { status: 400 });
  assert.equal(await fs.readFile(path.join(outside, 'sensitive.json'), 'utf8'), 'private');
});

test('manifest symlinks and directories swapped after opening are rejected', async t => {
  const options = await fixture(t);
  const batch = await createBatch('usa', [1], { ...options, batchId: FIRST });
  const manifestPath = path.join(batch.directory, 'manifest.json');
  const outsideFile = path.join(options.directory, 'outside.json');
  await fs.writeFile(outsideFile, await fs.readFile(manifestPath));
  await fs.unlink(manifestPath);
  await fs.symlink(outsideFile, manifestPath);
  await assert.rejects(openBatch('usa', FIRST, options), { status: 400 });
  await assert.rejects(setPageStage(batch, 1, 'details', 'running'), { status: 400 });
  await fs.unlink(manifestPath);
  await fs.copyFile(outsideFile, manifestPath);
  const moved = `${batch.directory}-moved`;
  await fs.rename(batch.directory, moved);
  await fs.symlink(moved, batch.directory, 'dir');
  assert.throws(() => pagePath(batch, 1), { status: 400 });
  await assert.rejects(openBatch('usa', FIRST, options), { status: 400 });
});
