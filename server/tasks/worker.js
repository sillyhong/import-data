#!/usr/bin/env node

const path = require('path');

const ALLOWED_COUNTRIES = new Set([
  'usa', 'india', 'vietnam', 'argentina', 'chile', 'colombia', 'costarica',
  'ecuador', 'panama', 'peru', 'paraguay', 'uruguay', 'venezuela',
]);

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空。`);
  return value.trim();
}

function requirePages(value) {
  if (!Array.isArray(value) || !value.length || value.some(page => !Number.isSafeInteger(page) || page < 1)) {
    throw new Error('pages 必须是正整数页码数组。');
  }
  return [...new Set(value)].sort((a, b) => a - b);
}

function requireCountry(value) {
  const country = requireString(value, 'country').toLowerCase();
  if (!ALLOWED_COUNTRIES.has(country)) throw new Error(`不支持的国家：${country}`);
  return country;
}

async function run(taskId, params) {
  if (taskId.startsWith('robot.')) {
    return require('../robot/runtime').runRobotTask(taskId, params);
  }
  if (taskId === 'importgenius.fetch-importers') {
    const { fetchImporter } = require('../../importgenius/crawler/fetchImporter');
    const { createBatch, openBatch } = require('../../importgenius/storage/batches');
    const country = requireCountry(params.country);
    const pages = requirePages(params.pages);
    const batch = params.batchMode === 'new' || !params.batchId
      ? await createBatch(country, pages, { batchId: params.batchId, source: params.batchSource || 'manual' })
      : await openBatch(country, params.batchId, { pages });
    console.log(`[ImportGenius][${country}][批次] ${batch.batchId}；目录 ${batch.directory}`);
    return fetchImporter(country, pages, { batch });
  }

  if (taskId === 'importgenius.fetch-shipments') {
    const { fetchShipments } = require('../../importgenius/crawler/fetchShipments');
    const requestSession = require('../../importgenius/crawler/pageRequest').createRequestSession();
    const country = requireCountry(params.country);
    const pages = requirePages(params.pages);
    const batch = await require('../../importgenius/storage/batches').openBatch(country, requireString(params.batchId, '采集批次'), { pages });
    console.log(`[ImportGenius][${country}][批次] ${batch.batchId}；目录 ${batch.directory}`);
    for (const page of pages) await fetchShipments(country, page, false, { requestSession, batch });
    return;
  }

  if (taskId === 'importgenius.import-batch') {
    const { batchInsertSql } = require('../../importgenius/database/ingest/batchInsertSql');
    const country = requireCountry(params.country);
    const pages = requirePages(params.pages);
    const batch = await require('../../importgenius/storage/batches').openBatch(country, requireString(params.batchId, '采集批次'), { pages });
    console.log(`[ImportGenius][${country}][批次] ${batch.batchId}；目录 ${batch.directory}`);
    for (const page of pages) await batchInsertSql(country, page, { batch });
    return;
  }

  if (taskId === 'importgenius.full-sync') {
    const countries = (Array.isArray(params.countries) && params.countries.length
      ? params.countries
      : [params.country]).map(requireCountry);
    const pages = requirePages(params.pages);
    const { runFullSync } = require('../../importgenius/workflows/fullSync');
    return runFullSync({
      countries,
      pages,
      batchId: params.batchId,
      batchMode: params.batchMode,
      source: params.batchSource || 'manual',
    });
  }

  if (taskId === 'importyeti.init') {
    const { initializeSchema } = require('../../importyeti/database/db');
    const result = await initializeSchema();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (taskId === 'importyeti.crawl') {
    const { crawl } = require('../../importyeti/crawler/crawler');
    return crawl({
      maxTargets: params.maxTargets,
      maxDepth: params.maxDepth,
      delayMs: params.delayMs,
      retryFailed: params.retryFailed,
      retryBlocked: params.retryBlocked,
    });
  }

  if (taskId === 'importyeti.full-sync') {
    const { runFullSync } = require('../../importyeti/workflows/fullSync');
    return runFullSync(params);
  }

  if (taskId === 'importyeti.enrich') {
    const { enrichFromImportInfo, parseImportInfoProfileUrl } = require('../../importyeti/enrichment/importinfo');
    return enrichFromImportInfo(parseImportInfoProfileUrl(requireString(params.profileUrl, 'profileUrl')));
  }

  if (taskId === 'importyeti.status') {
    const { showStatus } = require('../../importyeti/crawler/crawler');
    return showStatus();
  }

  if (taskId === 'importyeti.export') {
    const name = path.basename(requireString(params.filename, 'filename'));
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.csv$/i.test(name)) throw new Error('filename 仅支持安全的 CSV 文件名。');
    const { exportShipments } = require('../../importyeti/crawler/crawler');
    return exportShipments(path.join('exports', name));
  }

  if (taskId === 'database.ensure-indexes') {
    const importGenius = await require('../../importgenius/database/db').ensurePerformanceIndexes();
    const importYeti = await require('../../importyeti/database/db').ensurePerformanceIndexes();
    console.log(JSON.stringify({ importGenius, importYeti }, null, 2));
    return;
  }

  if (taskId === 'tasks.cleanup-logs' || taskId === 'scheduler.cleanup-logs') {
    const retentionDays = params.retentionDays === undefined ? 30 : params.retentionDays;
    if (!Number.isSafeInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650) {
      throw new Error('保留天数必须是 0 到 3650 之间的整数。');
    }
    const { taskLogs } = require('../task-logs');
    const result = await taskLogs.cleanupLogs({ retentionDays });
    console.log(`[任务日志] 清理完成：删除 ${result.deletedRuns} 次执行记录（${result.deletedFiles} 个文件），保留期内 ${result.retainedRuns} 次，运行中 ${result.skippedActive} 次，跳过未知文件 ${result.skippedUnknown} 个。`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (taskId === 'database.inspect') {
    const { inspectDatabases } = require('./database-audit');
    const report = await inspectDatabases();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  throw new Error(`不支持的任务：${taskId}`);
}

async function main() {
  const [, , taskId, rawParams = '{}'] = process.argv;
  let params;
  try {
    params = JSON.parse(rawParams);
  } catch (_) {
    throw new Error('任务参数格式错误。');
  }
  try {
    await run(taskId, params);
  } finally {
    if (!taskId?.startsWith('robot.')) {
      await Promise.all([
        require('../../importyeti/database/db').closePool().catch(() => {}),
        require('../../importgenius/database/db').closePool().catch(() => {}),
      ]);
    }
  }
}

main().catch(error => {
  if (process.argv[2]?.startsWith('robot.')) {
    const { EVENT_PREFIX } = require('../robot/runtime');
    const code = error.robotCode || (error.status === 400 ? 'invalidParams' : error.status === 503 || error.status === 404 ? 'unavailable' : 'scriptFailed');
    console.error(`${EVENT_PREFIX}${JSON.stringify({ type: 'failed', code })}`);
  } else {
    console.error(error.stack || error.message);
  }
  process.exitCode = 1;
});
