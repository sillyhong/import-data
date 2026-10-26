const fs = require('fs/promises');
const path = require('path');
const dayjs = require('dayjs');
const { delay } = require('./retry');
const { writeJsonAtomically, readJsonArray } = require('./io');
const { parseNuxtPage: parsePageData, PAGE_ERROR_CODES, isPageAccessError } = require('./pageData');
const { createRequestSession, requestPage } = require('./pageRequest');
const { openBatch, pagePath, setPageStage } = require('../storage/batches');

const BASE_URL = 'https://www.importgenius.cn';
const REQUEST_TIMEOUT_MS = 45000;
const DETAIL_BATCH_SIZE = 2;
const BATCH_DELAY_MS = 5000;
const SYSTEMIC_FAILURE_THRESHOLD = 3;

function getCountryDirectory(country) {
  if (!/^[a-z]+$/i.test(String(country || ''))) throw new Error('country 必须是国家代码。');
  return path.join(__dirname, `../data/importer/${country.toLowerCase()}`);
}

async function getJSONFilesByCountry(country, options = {}) {
  if (options.batch) return options.batch.pages.map(page => `${page}.json`);
  const directory = getCountryDirectory(country);
  let names;
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return names.filter(name => /^\d+\.json$/.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

function parseNuxtPage(html, response) {
  return parsePageData(html, { label: '详情页', response });
}

function normalizeShipments(shipments) {
  return shipments.map(shipment => ({
    ...shipment,
    mostRecentDate: shipment?.mostRecentDate && typeof shipment.mostRecentDate === 'number'
      ? dayjs.unix(shipment.mostRecentDate).format('YYYY-MM-DD HH:mm:ss')
      : shipment?.mostRecentDate,
  }));
}

function applyUruguayFields(nuxtData, shipments) {
  const detail = nuxtData?.state?.profile?.shipmentDetails || {};
  return shipments.map(shipment => ({
    ...shipment,
    BillOfLading: shipment.ArrivalDate || shipment.BillOfLading,
    ProductDescription: [detail.HSCode, detail.HSCodeDescription].filter(Boolean),
  }));
}

function getProfileUrl(relativeOrAbsoluteUrl) {
  let url;
  try {
    url = new URL(relativeOrAbsoluteUrl, `${BASE_URL}/`);
  } catch (_) {
    throw new Error(`详情页 URL 无效：${relativeOrAbsoluteUrl}`);
  }
  if (url.hostname !== 'www.importgenius.cn' && url.hostname !== 'importgenius.cn') {
    throw new Error(`详情页域名不受支持：${url.hostname}`);
  }
  return url.href;
}

async function fetchProfileShipments(country, item, options = {}) {
  if (!item?.url) throw new Error('公司记录缺少 url。');
  const url = getProfileUrl(item.url);
  if (process.env.TASK_ENV === 'local') {
    console.log(`[ImportGenius][${country}][详情] 请求地址：${url}`);
  }
  const response = await requestPage(url, {
    label: `[${country}][详情]`,
    timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS,
    retry: options.retry,
    requestSession: options.requestSession,
  });
  const nuxtData = parseNuxtPage(response.data, response);
  let shipments = nuxtData?.state?.profile?.shipments?.[0]?.shipments;
  if (!Array.isArray(shipments)) {
    throw Object.assign(new Error(`详情页返回的 shipments 格式异常：${item.url}`), {
      code: 'IMPORTGENIUS_SHIPMENTS_SCHEMA_CHANGED',
    });
  }
  if (country === 'uruguay') shipments = applyUruguayFields(nuxtData, shipments);
  return normalizeShipments(shipments);
}

async function collectSinglePage(country, pageNumber, options = {}) {
  const requestSession = options.requestSession || createRequestSession();
  requestSession.assertActive();
  const filePath = options.batch ? pagePath(options.batch, pageNumber) : path.join(getCountryDirectory(country), `${pageNumber}.json`);
  const data = await readJsonArray(filePath);
  const pending = data.map((item, index) => ({ item, index }))
    .filter(({ item }) => !Array.isArray(item?.shipments));
  const failed = [];
  let completed = 0;
  let skipped = data.length - pending.length;
  let repeatedFailureCode = null;
  let repeatedFailureCount = 0;
  const systemicCodes = new Set([PAGE_ERROR_CODES.MISSING, PAGE_ERROR_CODES.INVALID, 'IMPORTGENIUS_SHIPMENTS_SCHEMA_CHANGED']);

  console.log(`[ImportGenius][${country}][${pageNumber}][详情] 开始：${data.length} 家公司，待抓 ${pending.length}，已有详情 ${skipped}。`);
  for (let start = 0; start < pending.length; start += DETAIL_BATCH_SIZE) {
    const batch = pending.slice(start, start + DETAIL_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(({ item }) =>
      fetchProfileShipments(country, item, { ...options, requestSession })
    ));
    let batchSucceeded = 0;
    results.forEach((result, offset) => {
      const { item, index } = batch[offset];
      if (result.status === 'fulfilled') {
        data[index].shipments = result.value;
        batchSucceeded += 1;
      } else {
        const message = result.reason?.message || String(result.reason);
        failed.push({ url: item?.url || '(missing url)', message, code: result.reason?.code });
        console.error(`[ImportGenius][${country}][${pageNumber}][详情] 失败 ${item?.url || '(missing url)'}：${message}`);
      }
    });

    if (batchSucceeded) {
      await writeJsonAtomically(filePath, data);
      if (options.batch?.manifest?.pageStates?.[String(pageNumber)]?.import?.status === 'success') {
        await setPageStage(options.batch, pageNumber, 'import', 'pending');
      }
      completed += batchSucceeded;
    }
    console.log(`[ImportGenius][${country}][${pageNumber}][详情] 批次 ${Math.floor(start / DETAIL_BATCH_SIZE) + 1}/${Math.ceil(pending.length / DETAIL_BATCH_SIZE)}：成功 ${batchSucceeded}/${batch.length}；已完成 ${completed}/${pending.length}。`);

    const accessFailure = results.find(result => result.status === 'rejected' && isPageAccessError(result.reason));
    let repeatedFailure = null;
    for (const result of results) {
      const reason = result.status === 'rejected' ? result.reason : null;
      if (systemicCodes.has(reason?.code)) {
        repeatedFailureCount = repeatedFailureCode === reason.code ? repeatedFailureCount + 1 : 1;
        repeatedFailureCode = reason.code;
        repeatedFailure = repeatedFailureCount >= SYSTEMIC_FAILURE_THRESHOLD ? reason : null;
      } else {
        repeatedFailureCode = null;
        repeatedFailureCount = 0;
        repeatedFailure = null;
      }
    }
    const stopReason = accessFailure?.reason || repeatedFailure;
    if (stopReason) {
      const error = new Error(
        `详情采集已停止：${stopReason.message} 已完成 ${completed}/${pending.length}；checkpoint 保留在 ${filePath}，剩余记录未继续请求。`
      );
      error.code = stopReason.code;
      error.failedDetails = failed;
      throw error;
    }
    if (start + DETAIL_BATCH_SIZE < pending.length) await delay(options.batchDelayMs ?? BATCH_DELAY_MS);
  }

  if (failed.length) {
    const error = new Error(`详情抓取有 ${failed.length} 家失败；本次新增 ${completed} 家详情，checkpoint 保留在 ${filePath}，重跑会跳过已完成记录。`);
    error.failedDetails = failed;
    throw error;
  }
  console.log(`[ImportGenius][${country}][${pageNumber}][详情] 完成：新增 ${completed}，复用 ${skipped}。`);
  return { country, page: pageNumber, total: data.length, fetched: completed, skipped };
}

async function fetchSinglePage(country, pageNumber, options = {}) {
  const batch = options.batch || (options.batchId
    ? await openBatch(country, options.batchId, { pages: [Number(pageNumber)], dataRoot: options.dataRoot })
    : null);
  if (batch && batch.country !== country) throw new Error('采集批次与国家不匹配。');
  if (!batch) return collectSinglePage(country, pageNumber, options);
  await setPageStage(batch, pageNumber, 'details', 'running');
  try {
    const result = await collectSinglePage(country, pageNumber, { ...options, batch });
    const capturedAt = batch.manifest?.pageStates?.[String(pageNumber)]?.details?.capturedAt;
    await setPageStage(batch, pageNumber, 'details', 'success', {
      count: result.total, fetched: result.fetched,
      ...(result.fetched || !capturedAt ? { capturedAt: new Date().toISOString() } : {}),
    });
    return { ...result, batchId: batch.batchId };
  } catch (error) {
    await setPageStage(batch, pageNumber, 'details', 'failed', { error: error.message });
    throw error;
  }
}

async function fetchShipments(country, pageOrIndex, isIncrementalExecute = true, options = {}) {
  options = { ...options, requestSession: options.requestSession || createRequestSession() };
  options.requestSession.assertActive();
  country = String(country || '').toLowerCase();
  getCountryDirectory(country);
  if (!options.batch && options.batchId) {
    options.batch = await openBatch(country, options.batchId, { dataRoot: options.dataRoot });
  }
  if (!Number.isSafeInteger(Number(pageOrIndex)) || Number(pageOrIndex) < 1) {
    throw new Error('页码或文件序号必须是正整数。');
  }

  if (!isIncrementalExecute) return fetchSinglePage(country, Number(pageOrIndex), options);

  const files = await getJSONFilesByCountry(country, options);
  const startIndex = Number(pageOrIndex) - 1;
  if (startIndex >= files.length) {
    console.log(`[ImportGenius][${country}][详情] 已处理完所有文件（${files.length} 个）。`);
    return { country, completed: true, files: files.length, processed: 0 };
  }
  const results = [];
  for (let index = startIndex; index < files.length; index += 1) {
    const pageNumber = Number.parseInt(files[index], 10);
    results.push(await fetchSinglePage(country, pageNumber, options));
  }
  console.log(`[ImportGenius][${country}][详情] 增量处理完成：${results.length} 个文件。`);
  return { country, completed: true, files: files.length, processed: results.length, results };
}

module.exports = { fetchShipments, fetchSinglePage, fetchProfileShipments, parseNuxtPage, getJSONFilesByCountry };
