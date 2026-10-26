const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const axios = require('axios');
const database = require('../database/db');
const { runFullSync } = require('./fullSync');
const { fetchImporter, scrapePage } = require('../crawler/fetchImporter');
const { createBatch, openBatch, pagePath, listBatches } = require('../storage/batches');
const { batchInsertSql } = require('../database/ingest/batchInsertSql');

function nuxt(payload) {
  return `<html><head><title>ImportGenius</title></head><script>window.__NUXT__ = ${JSON.stringify(payload)};</script></html>`;
}

async function fixture(t, options = {}) {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-flow-batches-'));
  const environment = process.env.TASK_ENV;
  process.env.TASK_ENV = 'local';
  t.after(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
    if (environment === undefined) delete process.env.TASK_ENV;
    else process.env.TASK_ENV = environment;
  });
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, () => {});
  const state = { version: 1, failDetail: null, failCommit: false, requests: [], commits: 0, rollbacks: 0, records: new Map() };
  let transaction;
  const connection = {
    async query(sql, urls) {
      assert.match(sql, /^SELECT url, raw FROM importgenius/);
      return [[...state.records.values()].filter(record => urls.includes(record.url))];
    },
    async execute(sql, params) {
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[]];
      if (sql.startsWith('INSERT INTO importgenius ')) {
        for (let offset = 0; offset < params.length; offset += 7) {
          const [raw, totalShipments, company, contactInfo, mostRecentDate, url, country] = params.slice(offset, offset + 7);
          transaction.set(url, { raw, totalShipments, company, contactInfo, mostRecentDate, url, country });
        }
      } else if (sql.startsWith('UPDATE importgenius SET')) {
        const count = params.length / 7;
        for (let index = 0; index < count; index += 1) {
          const url = params[index * 2];
          transaction.set(url, { ...transaction.get(url), totalShipments: params[index * 2 + 1],
            mostRecentDate: params[count * 2 + index * 2 + 1], raw: params[count * 4 + index * 2 + 1] });
        }
      } else throw new Error(`Unexpected SQL in isolated fixture: ${sql}`);
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { transaction = new Map(state.records); },
    async commit() {
      if (state.failCommit) throw Object.assign(new Error('Isolated commit failure'), { code: 'ER_PARSE_ERROR' });
      state.records = new Map(transaction); state.commits += 1;
    },
    async rollback() { transaction = null; state.rollbacks += 1; },
    release() {},
  };
  t.mock.method(database, 'getDatabaseSettings', () => ({}));
  t.mock.method(database, 'getPool', () => ({ query: async () => [[{ ok: 1 }]], getConnection: async () => connection }));
  t.mock.method(axios, 'get', async url => {
    state.requests.push(url);
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(?:([a-z]+)\/)?tradebase\/(?:browse\/)?importer\/latest\/(\d+)$/);
    let payload;
    if (match) {
      const country = match[1] || 'usa';
      const page = Number(match[2]);
      const items = (options.twoOnFirstPage && page === 1 ? ['a', 'b'] : ['a']).map(suffix => ({
        company: `Company ${country}-${page}-${suffix}`,
        url: `/importers/${country}-${page}-${suffix}`,
        totalShipments: state.version,
      }));
      payload = { state: { tradebase: { traders: { [country === 'usa' ? 'us' : country]: { importers: { [page]: items } } } } } };
    } else {
      if (state.failDetail && parsed.pathname.endsWith(state.failDetail)) {
        throw Object.assign(new Error('Isolated unavailable detail'), { code: 'ERR_BAD_RESPONSE',
          response: { status: 503, data: '<html><title>Unavailable</title></html>', config: { url } } });
      }
      payload = { state: { profile: { shipments: [{ shipments: [{
        BillOfLading: `BOL-${parsed.pathname.split('/').pop()}-v${state.version}`, ProductDescription: ['TEST CARGO'],
      }] }] } } };
    }
    return { status: 200, data: nuxt(payload), headers: { 'content-type': 'text/html' }, config: { url },
      request: { res: { responseUrl: url } } };
  });
  return { state, dataRoot, runOptions: { countries: ['usa'], pages: [1], dataRoot,
    requestOptions: { batchDelayMs: 0, pageDelayMs: 0, retry: { maxAttempts: 1 } } } };
}

test('new same-day collections retain old snapshots and fetch new shipments for the same company', async t => {
  const { state, dataRoot, runOptions } = await fixture(t);
  const first = await runFullSync({ ...runOptions, batchId: '20261026/103025-aaaaaaaa', batchMode: 'new' });
  const firstBatch = await openBatch('usa', first.batchId, { dataRoot });
  const original = await fs.readFile(pagePath(firstBatch, 1), 'utf8');
  state.version = 2;
  const second = await runFullSync({ ...runOptions, batchId: '20261026/160012-bbbbbbbb', batchMode: 'new' });
  const secondBatch = await openBatch('usa', second.batchId, { dataRoot });
  assert.equal(await fs.readFile(pagePath(firstBatch, 1), 'utf8'), original);
  const updated = JSON.parse(await fs.readFile(pagePath(secondBatch, 1), 'utf8'));
  assert.match(updated[0].shipments[0].BillOfLading, /v2$/);
  assert.equal(state.requests.filter(url => url.includes('/importers/')).length, 2);
  assert.equal(JSON.parse(state.records.get('/importers/usa-1-a').raw).shipments.length, 2);
  assert.equal((await listBatches('usa', { dataRoot })).length, 2);
  assert.equal(secondBatch.manifest.pageStates[1].import.status, 'success');
});

test('resume retains dated lists, checkpoints partial details and skips already committed pages', async t => {
  const { state, dataRoot, runOptions } = await fixture(t, { twoOnFirstPage: true });
  state.failDetail = 'usa-1-b';
  const batchId = '20261025/235959-cccccccc';
  await assert.rejects(runFullSync({ ...runOptions, pages: [1, 2], batchId, batchMode: 'new' }), /使用批次.*续跑/);
  let batch = await openBatch('usa', batchId, { dataRoot });
  const checkpoint = JSON.parse(await fs.readFile(pagePath(batch, 1), 'utf8'));
  assert.ok(Array.isArray(checkpoint[0].shipments));
  assert.equal(checkpoint[1].shipments, undefined);
  assert.equal(batch.manifest.pageStates[1].details.status, 'failed');
  assert.equal(batch.manifest.pageStates[2].import.status, 'success');
  assert.equal(state.commits, 1);
  const requestCount = state.requests.length;
  state.failDetail = null;
  await runFullSync({ ...runOptions, pages: [1, 2], batchId });
  assert.deepEqual(state.requests.slice(requestCount), ['https://www.importgenius.cn/importers/usa-1-b']);
  assert.equal(state.commits, 2);
  batch = await openBatch('usa', batchId, { dataRoot });
  assert.equal(batch.manifest.pageStates[1].details.status, 'success');
  assert.equal(batch.manifest.pageStates[1].import.status, 'success');
});

test('failed database commit leaves a resumable batch and does not refetch list or details', async t => {
  const { state, dataRoot, runOptions } = await fixture(t);
  state.failCommit = true;
  const batchId = '20261026/103025-dddddddd';
  await assert.rejects(runFullSync({ ...runOptions, batchId, batchMode: 'new' }), /1 页失败/);
  assert.equal(state.records.size, 0);
  assert.equal(state.rollbacks, 1);
  let batch = await openBatch('usa', batchId, { dataRoot });
  assert.equal(batch.manifest.pageStates[1].import.status, 'failed');
  const requests = state.requests.length;
  state.failCommit = false;
  await runFullSync({ ...runOptions, batchId });
  assert.equal(state.requests.length, requests);
  assert.equal(state.commits, 1);
  batch = await openBatch('usa', batchId, { dataRoot });
  assert.equal(batch.manifest.pageStates[1].import.status, 'success');
});

test('multi-country weekly-style collection uses one batch ID with separate country progress', async t => {
  const { state, dataRoot, runOptions } = await fixture(t);
  const result = await runFullSync({ ...runOptions, countries: ['usa', 'india'] });
  for (const country of ['usa', 'india']) {
    const batch = await openBatch(country, result.batchId, { dataRoot });
    assert.equal(batch.batchId, result.batchId);
    assert.equal(batch.manifest.pageStates[1].import.status, 'success');
  }
  assert.equal(state.records.size, 2);
});

test('legacy flat JSON remains explicitly selectable without inventing dates or moving files', async t => {
  const { state, dataRoot, runOptions } = await fixture(t);
  await fs.mkdir(path.join(dataRoot, 'usa'));
  const saved = JSON.stringify([{ company: 'Legacy', url: '/importers/old', shipments: [{ BillOfLading: 'OLD' }] }]);
  await fs.writeFile(path.join(dataRoot, 'usa/1.json'), saved);
  await runFullSync({ ...runOptions, batchId: 'legacy' });
  assert.deepEqual(await fs.readdir(path.join(dataRoot, 'usa')), ['1.json']);
  assert.equal(await fs.readFile(path.join(dataRoot, 'usa/1.json'), 'utf8'), saved);
  assert.equal(state.requests.length, 0);
  assert.equal(state.records.size, 1);
  const [entry] = await listBatches('usa', { dataRoot });
  assert.equal(entry.batchId, 'legacy');
  assert.equal(entry.createdAt, null);
});

test('a recovered list checkpoint remains protected after repeated missing-file failures', async t => {
  const { state, dataRoot } = await fixture(t);
  const batch = await createBatch('usa', [1], { dataRoot });
  await fs.writeFile(pagePath(batch, 1), JSON.stringify([{ url: '/importers/recovered' }]));
  await fetchImporter('usa', [1], { batch });
  assert.equal(batch.manifest.pageStates[1].list.recovered, true);
  await fs.rm(pagePath(batch, 1));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(fetchImporter('usa', [1], { batch }), /不会重新抓写/);
  }
  assert.equal(state.requests.length, 0);
});

test('atomic list publication refuses to replace an existing page even for a direct scrape call', async t => {
  const { dataRoot } = await fixture(t);
  const batch = await createBatch('usa', [1], { dataRoot });
  await fs.writeFile(pagePath(batch, 1), '[{"company":"Original"}]');
  await assert.rejects(scrapePage('usa', 1, { batch }), { code: 'EEXIST' });
  assert.equal(await fs.readFile(pagePath(batch, 1), 'utf8'), '[{"company":"Original"}]');
});

test('direct import of an unfinished collection fails without committing or marking it imported', async t => {
  const { state, dataRoot } = await fixture(t);
  const batch = await createBatch('usa', [1], { dataRoot });
  await fs.writeFile(pagePath(batch, 1), JSON.stringify([{ url: '/importers/unfinished' }]));
  await assert.rejects(batchInsertSql('usa', 1, { batch }), /shipment 明细尚未补齐/);
  assert.equal(state.commits, 0);
  assert.equal(state.records.size, 0);
  assert.equal((await openBatch('usa', batch.batchId, { dataRoot })).manifest.pageStates[1].import.status, 'failed');
});

test('database preflight failure makes no new collection and requests no website pages', async t => {
  const { state, dataRoot, runOptions } = await fixture(t);
  t.mock.method(database, 'getDatabaseSettings', () => { throw new Error('Isolated missing database settings'); });
  await assert.rejects(runFullSync(runOptions), /missing database settings/);
  assert.deepEqual(await listBatches('usa', { dataRoot }), []);
  assert.equal(state.requests.length, 0);
});
