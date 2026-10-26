const crypto = require('crypto');
const runner = require('../task-runner');
const { getRobotTask, validateRobotParams } = require('../robot/catalog');
const { validateBatchId, openBatch, listBatches } = require('../../importgenius/storage/batches');

const COUNTRIES = [
  'usa', 'india', 'vietnam', 'argentina', 'chile', 'colombia', 'costarica',
  'ecuador', 'panama', 'peru', 'paraguay', 'uruguay', 'venezuela',
];

function validateOrigin(ctx) {
  const origin = ctx.get('origin');
  if (!origin) throw Object.assign(new Error('写操作必须提供 Origin 请求头。'), { status: 403 });
  try {
    new URL(origin);
  } catch (_) {
    throw Object.assign(new Error('请求来源无效。'), { status: 403 });
  }
}

function validateWrite(ctx) {
  validateOrigin(ctx);
  const environment = runner.getEnvironment();
  if (environment === 'unknown') throw Object.assign(new Error('后端 TASK_ENV 未配置，任务执行已禁用。'), { status: 503 });
  if (environment === 'production') {
    const configured = process.env.TASK_CONTROL_TOKEN || '';
    const provided = ctx.get('x-task-control-token') || '';
    const configuredBuffer = Buffer.from(configured);
    const providedBuffer = Buffer.from(provided);
    if (!configured || configuredBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(configuredBuffer, providedBuffer)) {
      throw Object.assign(new Error('生产任务控制令牌无效或未配置。'), { status: 403 });
    }
    if (ctx.get('x-task-confirmed') !== 'true') {
      throw Object.assign(new Error('生产环境操作需要二次确认。'), { status: 403 });
    }
  }
}

function parsePages(value) {
  if (!Array.isArray(value) || !value.length || value.some(page => !Number.isSafeInteger(page) || page < 1 || page > 10000)) {
    throw Object.assign(new Error('页码必须是 1 到 10000 的正整数数组。'), { status: 400 });
  }
  const pages = [...new Set(value)].sort((a, b) => a - b);
  if (pages.length > 20) throw Object.assign(new Error('单次最多选择 20 页。'), { status: 400 });
  return pages;
}

function validateCountry(value) {
  const country = String(value || '').trim().toLowerCase();
  if (!COUNTRIES.includes(country)) throw Object.assign(new Error('国家不在允许列表中。'), { status: 400 });
  return country;
}

function integer(value, label, min, max, fallback) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${label} 必须是 ${min} 到 ${max} 之间的整数。`), { status: 400 });
  }
  return parsed;
}

function normalizeParams(taskId, value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('任务参数格式错误。'), { status: 400 });
  if (getRobotTask(taskId)) return validateRobotParams(taskId, value);
  if (['importgenius.fetch-importers', 'importgenius.fetch-shipments', 'importgenius.import-batch', 'importgenius.full-sync'].includes(taskId)) {
    const params = { country: validateCountry(value.country), pages: parsePages(value.pages) };
    if (value.batchId !== undefined) params.batchId = validateBatchId(value.batchId);
    if (['importgenius.fetch-shipments', 'importgenius.import-batch'].includes(taskId) && !params.batchId) {
      throw Object.assign(new Error('请先选择采集批次；旧版平铺 JSON 请选择 legacy 历史数据。'), { status: 400 });
    }
    return params;
  }
  if (taskId === 'importyeti.crawl') {
    return {
      maxTargets: integer(value.maxTargets, 'maxTargets', 1, 1000, 100),
      maxDepth: integer(value.maxDepth, 'maxDepth', 0, 5, 2),
      delayMs: integer(value.delayMs, 'delayMs', 2000, 60000, 3000),
      retryFailed: value.retryFailed === true,
      retryBlocked: value.retryBlocked === true,
    };
  }
  if (taskId === 'importyeti.enrich') {
    const profileUrl = String(value.profileUrl || '').trim();
    if (profileUrl.length > 512) throw Object.assign(new Error('profileUrl 过长。'), { status: 400 });
    return { profileUrl };
  }
  if (taskId === 'importyeti.export') {
    const filename = String(value.filename || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.csv$/i.test(filename)) {
      throw Object.assign(new Error('导出文件名仅支持字母、数字、点、下划线和短横线，且以 .csv 结尾。'), { status: 400 });
    }
    return { filename };
  }
  if (['tasks.cleanup-logs', 'scheduler.cleanup-logs'].includes(taskId)) {
    return { retentionDays: integer(value.retentionDays, '保留天数', 0, 3650, 30) };
  }
  if (['importyeti.init', 'importyeti.status', 'database.inspect', 'database.ensure-indexes'].includes(taskId)) return {};
  throw Object.assign(new Error('未知任务。'), { status: 404 });
}

async function getTasks(ctx) {
  ctx.body = runner.getCatalog();
}

async function getImportGeniusBatches(ctx) {
  const country = validateCountry(ctx.query?.country);
  ctx.body = { batches: await listBatches(country, { environment: runner.getEnvironment() }) };
}

async function runTask(ctx) {
  if (['importyeti.status', 'database.inspect', 'robot.inspect'].includes(ctx.params.taskId)) {
    validateOrigin(ctx);
    if (!runner.isWriteEnvironmentConfigured()) throw Object.assign(new Error('后端 TASK_ENV 未配置，任务执行已禁用。'), { status: 503 });
  } else {
    validateWrite(ctx);
  }
  const body = getRobotTask(ctx.params.taskId) ? ctx.request.body : ctx.request.body || {};
  const params = normalizeParams(ctx.params.taskId, body);
  if (ctx.params.taskId.startsWith('importgenius.') && params.batchId) {
    await openBatch(params.country, params.batchId, { pages: params.pages, environment: runner.getEnvironment() });
  }
  const run = await runner.runTask(ctx.params.taskId, params);
  ctx.status = 202;
  ctx.body = run;
}

async function getTaskRun(ctx) {
  ctx.body = runner.getRun(ctx.params.taskId, ctx.params.runId);
}

async function stopTask(ctx) {
  validateWrite(ctx);
  const run = await runner.stopTask(ctx.params.taskId, ctx.params.runId);
  ctx.status = run.status === 'stopping' ? 202 : 200;
  ctx.body = run;
}

async function updateScheduler(ctx) {
  validateWrite(ctx);
  const action = String((ctx.request.body || {}).action || '');
  ctx.body = runner.setScheduler(action);
}

module.exports = { getTasks, getImportGeniusBatches, runTask, stopTask, getTaskRun, updateScheduler };
