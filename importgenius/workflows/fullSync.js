const { fetchImporter } = require('../crawler/fetchImporter');
const { fetchShipments } = require('../crawler/fetchShipments');
const { withRetry, isRetryableDatabaseError } = require('../crawler/retry');
const { readJsonArray } = require('../crawler/io');
const { batchInsertSql } = require('../database/ingest/batchInsertSql');
const database = require('../database/db');
const { isPageAccessError } = require('../crawler/pageData');
const { createRequestSession } = require('../crawler/pageRequest');
const { createBatchId, createBatch, openBatch, pagePath } = require('../storage/batches');

const ALLOWED_COUNTRIES = new Set([
  'usa', 'india', 'vietnam', 'argentina', 'chile', 'colombia', 'costarica',
  'ecuador', 'panama', 'peru', 'paraguay', 'uruguay', 'venezuela',
]);

function normalizeCountries(options) {
  const values = options.countries?.length ? options.countries : [options.country || 'usa'];
  const countries = [...new Set(values.map(value => String(value).trim().toLowerCase()))];
  for (const country of countries) {
    if (!ALLOWED_COUNTRIES.has(country)) throw new Error(`不支持的国家：${country}`);
  }
  return countries;
}

function normalizePages(value) {
  if (!Array.isArray(value) || !value.length || value.some(page => !Number.isSafeInteger(Number(page)) || Number(page) < 1)) {
    throw new Error('pages 必须是正整数页码数组。');
  }
  return [...new Set(value.map(Number))].sort((a, b) => a - b);
}

function elapsed(startedAt) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

async function runFullSync(options = {}) {
  const countries = normalizeCountries(options);
  const pages = normalizePages(options.pages);
  const batchId = options.batchId || createBatchId();
  const batchMode = options.batchMode || (options.batchId ? 'resume' : 'new');
  if (!['new', 'resume'].includes(batchMode)) throw new Error('采集方式必须是 new 或 resume。');
  if (options.cleanup) throw new Error('采集批次保留历史 JSON，不支持执行后自动删除；请移除 cleanup/--cleanup。');
  if (batchMode === 'resume' && options.refreshList === true) throw new Error('续跑不会刷新已保存列表；需要刷新站点数据时请新建采集批次。');
  const failures = [];
  const completed = [];
  const requestSession = options.requestSession || createRequestSession();

  // Fail before scraping if the selected environment has no usable database configuration.
  database.getDatabaseSettings();
  await withRetry('MySQL 连接预检', () => database.getPool().query('SELECT 1'), {
    maxAttempts: 4,
    baseDelayMs: 1000,
    shouldRetry: isRetryableDatabaseError,
  });
  console.log('[ImportGenius][预检] MySQL 连接正常。');
  const batches = new Map();
  for (const country of countries) {
    const batch = batchMode === 'new'
      ? await createBatch(country, pages, { batchId, source: options.source || 'cli', dataRoot: options.dataRoot })
      : await openBatch(country, batchId, { pages, dataRoot: options.dataRoot });
    batches.set(country, batch);
  }
  console.log(`[ImportGenius][流程] 开始：环境 ${process.env.TASK_ENV}；国家 ${countries.join(', ')}；页码 ${pages.join(', ')}；${batchMode === 'new' ? '新建' : '续跑'}批次 ${batchId}；历史 JSON 全部保留。`);

  for (const country of countries) {
    for (const page of pages) {
      const pageStartedAt = Date.now();
      const batch = batches.get(country);
      const checkpointPath = pagePath(batch, page);
      console.log(`[ImportGenius][${country}][${page}][流程] 开始。`);
      try {
        await fetchImporter(country, [page], {
          ...options.requestOptions, batch, pageDelayMs: 0, requestSession,
        });
        // Only this collection's checkpoints are reused. A fresh collection never inherits old shipments.
        await fetchShipments(country, page, false, { ...options.requestOptions, batch, requestSession });
        if (batch.manifest?.pageStates?.[String(page)]?.import?.status === 'success') {
          await readJsonArray(checkpointPath);
          console.log(`[ImportGenius][${country}][${page}][入库] 本批次已完成入库，跳过。`);
        } else {
          await withRetry(`[${country}][${page}] MySQL 入库`, () => batchInsertSql(country, page, { batch }), {
            maxAttempts: 4,
            baseDelayMs: 1000,
            shouldRetry: isRetryableDatabaseError,
          });
        }
        completed.push({ country, page, pagePath: checkpointPath });
        console.log(`[ImportGenius][${country}][${page}][流程] 完成，耗时 ${elapsed(pageStartedAt)}；JSON checkpoint 已保留。`);
      } catch (error) {
        const message = error?.message || String(error);
        failures.push({ country, page, message });
        console.error(`[ImportGenius][${country}][${page}][流程] 失败，耗时 ${elapsed(pageStartedAt)}；批次 ${batchId} checkpoint 保留，选择该批次可续跑：${message}`);
        if (isPageAccessError(error)) {
          error.message = `站点限制访问，完整流程已停止；已完成 ${completed.length} 页，批次 ${batchId} 的 checkpoint 保留，选择该批次续跑。${message}`;
          error.batchId = batchId;
          error.failures = failures;
          throw error;
        }
      }
    }
  }

  if (failures.length) {
    console.error(`[ImportGenius][流程] 部分失败：成功 ${completed.length}/${countries.length * pages.length} 页，失败 ${failures.length} 页；所有 JSON checkpoint 均保留。`);
    const error = new Error(`ImportGenius 流程有 ${failures.length} 页失败：${failures.map(item => `${item.country}/${item.page}`).join(', ')}。使用批次 ${batchId} 续跑会复用已完成列表和详情；不选批次会新建采集。`);
    error.batchId = batchId;
    error.failures = failures;
    throw error;
  }

  const summary = { batchId, countries, pages, completed: completed.length, cleanup: false };
  console.log(`[ImportGenius][流程] 全部完成：${completed.length} 页；批次 ${batchId} 的 JSON 已保留。`);
  return summary;
}

module.exports = { runFullSync, normalizeCountries, normalizePages };
