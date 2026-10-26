const { taskLogs } = require('../task-logs');

const CATEGORIES = new Set(['importgenius', 'importyeti', 'database', 'robot', 'maintenance', 'scheduler', 'other']);
const STATUSES = new Set(['pending', 'running', 'stopping', 'success', 'failed', 'stopped', 'skipped', 'start_failed', 'interrupted']);

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function text(value, label, maxLength = 200) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > maxLength) throw invalid(`${label}格式错误或过长。`);
  return value.trim();
}

function integer(value, label, fallback, max) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw invalid(`${label}必须为正整数。`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw invalid(`${label}必须在 1 到 ${max} 之间。`);
  return parsed;
}

function choice(value, label, values, fallback = '') {
  const parsed = text(value, label, 50);
  if (!parsed) return fallback;
  if (!values.has(parsed)) throw invalid(`${label}不在允许范围内。`);
  return parsed;
}

function timestamp(value, label) {
  const parsed = text(value, label, 50);
  if (!parsed) return '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw invalid(`${label}必须包含完整日期、时间及时区。`);
  }
  return new Date(parsed).toISOString();
}

function recordId(ctx) {
  const id = ctx.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw invalid('日志 ID 格式错误。');
  }
  return id.toLowerCase();
}

async function readLogs(operation) {
  try {
    return await operation();
  } catch (error) {
    if ([400, 404, 503].includes(error.status)) throw error;
    console.error('[task-logs] 读取失败:', error.message);
    const message = error.code === 'ERR_UNSAFE_SCHEDULER_LOG_PATH'
      ? '日志目录不可读取，请检查目录配置。'
      : ['EACCES', 'EPERM'].includes(error.code)
        ? '没有读取任务日志的权限。'
        : '任务日志读取失败，请稍后重试。';
    throw Object.assign(new Error(message), { status: 503 });
  }
}

async function listLogs(ctx) {
  const query = ctx.query || {};
  const filters = {
    page: integer(query.page, '页码', 1, 1000000),
    pageSize: integer(query.pageSize, '每页条数', 20, 100),
    category: choice(query.category, '分类', CATEGORIES),
    triggerType: choice(query.triggerType, '触发方式', new Set(['manual', 'scheduled'])),
    taskId: text(query.taskId, '任务', 128),
    status: choice(query.status, '执行状态', STATUSES),
    environment: choice(query.environment, '环境', new Set(['local', 'production', 'unknown'])),
    country: text(query.country, '国家', 80),
    from: timestamp(query.from, '开始时间'),
    to: timestamp(query.to, '结束时间'),
    keyword: text(query.keyword, '关键词'),
    runId: text(query.runId, '运行 ID', 128),
  };
  if (filters.category === 'scheduler') filters.category = 'maintenance';
  if (filters.from && filters.to && Date.parse(filters.from) >= Date.parse(filters.to)) {
    throw invalid('开始时间必须早于结束时间。');
  }
  ctx.set('Cache-Control', 'no-store');
  ctx.body = await readLogs(() => taskLogs.listRecords(filters));
}

async function getLog(ctx) {
  ctx.set('Cache-Control', 'no-store');
  const id = recordId(ctx);
  ctx.body = await readLogs(() => taskLogs.getRecord(id));
}

async function getOutput(ctx) {
  const query = ctx.query || {};
  const options = {
    cursor: text(query.cursor, '日志游标', 2048),
    limit: integer(query.limit, '输出条数', 200, 200),
    stream: choice(query.stream, '输出类型', new Set(['all', 'stdout', 'stderr']), 'all'),
    keyword: text(query.keyword, '输出关键词'),
  };
  ctx.set('Cache-Control', 'no-store');
  const id = recordId(ctx);
  ctx.body = await readLogs(() => taskLogs.readOutput(id, options));
}

module.exports = { listLogs, getLog, getOutput };
