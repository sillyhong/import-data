const dayjs = require('dayjs');
const path = require('path');
const { delay } = require('./retry');
const { writeJsonAtomically, readJsonArray } = require('./io');
const { parseNuxtPage } = require('./pageData');
const { createRequestSession, requestPage } = require('./pageRequest');
const { createBatch, openBatch, pagePath, setPageStage } = require('../storage/batches');

const BASE_URL = 'https://www.importgenius.cn';
const PAGE_TIMEOUT_MS = 45000;
const PAGE_DELAY_MS = 4000;
const DEFAULT_PAGE_COUNT = 200;
const countryMap = { usa: 'us', argentina: 'argentina', chile: 'chile' };

function getCountryDirectory(country) {
  if (!/^[a-z]+$/i.test(String(country || ''))) throw new Error('country 必须是国家代码。');
  return path.join(__dirname, `../data/importer/${country.toLowerCase()}`);
}

function getPageNumbers(country) {
  const directory = getCountryDirectory(country);
  let names = [];
  try {
    names = require('fs').readdirSync(directory).filter(name => /^\d+\.json$/.test(name));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return names.map(name => Number.parseInt(name, 10)).filter(Number.isSafeInteger).sort((a, b) => a - b);
}

function getIndexByFile(country) {
  const pages = getPageNumbers(country);
  const startPage = pages.length ? pages[pages.length - 1] + 1 : 1;
  return { startPage, endPage: startPage + DEFAULT_PAGE_COUNT - 1 };
}

function getUrl(country, pageNumber) {
  const prefix = country === 'usa' ? '' : `${country}/`;
  return `${BASE_URL}/${prefix}tradebase/${country === 'usa' ? 'browse/' : ''}importer/latest/${pageNumber}`;
}

function extractNuxtData(html, response) {
  return parseNuxtPage(html, { label: '列表页', response });
}

function normalizeImporterItems(items) {
  if (!Array.isArray(items)) throw new Error('ImportGenius 列表响应格式异常：importers 不是数组。');
  return items.map(source => {
    if (!source || typeof source !== 'object') throw new Error('ImportGenius 列表包含无效记录。');
    const item = { ...source };
    delete item.consignees;
    delete item.datapoints;
    delete item.ports;
    if (item.mostRecentDate && typeof item.mostRecentDate === 'number') {
      item.mostRecentDate = dayjs.unix(item.mostRecentDate).format('YYYY-MM-DD HH:mm:ss');
    }
    if (item.shippers?.items && Array.isArray(item.shippers.items)) {
      item.shippers = {
        ...item.shippers,
        items: item.shippers.items.map(shipper => ({
          ...shipper,
          mostRecentDate: shipper.mostRecentDate && typeof shipper.mostRecentDate === 'number'
            ? dayjs.unix(shipper.mostRecentDate).format('YYYY-MM-DD HH:mm:ss')
            : shipper.mostRecentDate,
        })),
      };
    }
    return item;
  });
}

async function scrapePage(country, pageNumber, options = {}) {
  const batch = options.batch || (options.batchId
    ? await openBatch(country, options.batchId, { pages: [pageNumber], dataRoot: options.dataRoot })
    : await createBatch(country, [pageNumber], { source: options.source || 'cli', dataRoot: options.dataRoot }));
  if (batch.country !== country) throw new Error('采集批次与国家不匹配。');
  const url = getUrl(country, pageNumber);
  if (process.env.TASK_ENV === 'local') {
    console.log(`[ImportGenius][${country}][${pageNumber}][列表] 请求地址：${url}`);
  }
  await setPageStage(batch, pageNumber, 'list', 'running');
  try {
    const response = await requestPage(url, {
      label: `[${country}][${pageNumber}][列表]`,
      timeoutMs: options.timeoutMs || PAGE_TIMEOUT_MS,
      retry: options.retry,
      requestSession: options.requestSession,
    });
    const nuxtData = extractNuxtData(response.data, response);
    const countryKey = countryMap[country] || country;
    const items = nuxtData?.state?.tradebase?.traders?.[countryKey]?.importers?.[pageNumber];
    const normalized = normalizeImporterItems(items);
    const filePath = pagePath(batch, pageNumber);
    await writeJsonAtomically(filePath, normalized, { exclusive: true });
    await setPageStage(batch, pageNumber, 'list', 'success', { count: normalized.length, capturedAt: new Date().toISOString() });
    console.log(`[ImportGenius][${country}][${pageNumber}][列表] 完成：${normalized.length} 家公司；已原子写入 ${filePath}`);
    return { page: pageNumber, count: normalized.length, filePath, batchId: batch.batchId };
  } catch (error) {
    await setPageStage(batch, pageNumber, 'list', 'failed', { error: error.message });
    throw error;
  }
}

function normalizePages(pages) {
  if (pages === undefined || pages === null || (Array.isArray(pages) && !pages.length)) {
    throw new Error('抓取列表必须明确指定页码；新采集不会根据历史文件推算下一页。');
  }
  const list = Array.isArray(pages) ? pages : [pages];
  if (!list.length || list.some(page => !Number.isSafeInteger(Number(page)) || Number(page) < 1)) {
    throw new Error('页码必须是正整数。');
  }
  return [...new Set(list.map(Number))].sort((a, b) => a - b);
}

async function fetchImporter(country, scrapeArr = [], options = {}) {
  options = { ...options, requestSession: options.requestSession || createRequestSession() };
  options.requestSession.assertActive();
  country = String(country || '').toLowerCase();
  getCountryDirectory(country);
  const pages = normalizePages(scrapeArr);
  const batch = options.batch || (options.batchId
    ? await openBatch(country, options.batchId, { pages, dataRoot: options.dataRoot })
    : await createBatch(country, pages, { source: options.source || 'cli', dataRoot: options.dataRoot }));
  if (batch.country !== country) throw new Error('采集批次与国家不匹配。');
  options.batch = batch;
  const results = [];
  const reused = [];
  console.log(`[ImportGenius][${country}][批次] ${batch.batchId}；目录 ${batch.directory}。`);

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    options.requestSession.assertActive();
    const filePath = pagePath(batch, page);
    const listState = batch.manifest?.pageStates?.[String(page)]?.list;
    try {
      let existing;
      try {
        existing = await readJsonArray(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT' || listState?.status === 'success' || listState?.capturedAt || listState?.recovered) {
          throw new Error(`批次列表 checkpoint 无法读取 ${filePath}；为避免覆盖历史，不会重新抓写，请恢复文件或新建采集批次。原因：${error.message}`);
        }
      }
      if (existing) {
        if (listState?.status !== 'success') {
          await setPageStage(batch, page, 'list', 'success', { count: existing.length, recovered: true });
        }
        console.log(`[ImportGenius][${country}][${page}][列表] 复用批次 ${batch.batchId} 的 checkpoint（${existing.length} 家公司），不重新抓写列表。`);
        reused.push({ page, count: existing.length, filePath });
        continue;
      }
      if (batch.legacy) throw new Error(`历史数据缺少 ${filePath}；请选择已有页码，或新建采集批次。`);
      const result = await scrapePage(country, page, options);
      results.push(result);
    } catch (error) {
      const state = batch.manifest?.pageStates?.[String(page)]?.list;
      if (state?.status !== 'failed' || state.error !== error.message) {
        await setPageStage(batch, page, 'list', 'failed', { error: error.message });
      }
      throw error;
    }
    if (index < pages.length - 1) await delay(options.pageDelayMs ?? PAGE_DELAY_MS);
  }

  return { country, batchId: batch.batchId, directory: batch.directory, requested: pages.length, fetched: results.length, reused, pages: results };
}

module.exports = { fetchImporter, scrapePage, getIndexByFile, getPageNumbers, getUrl, extractNuxtData };
