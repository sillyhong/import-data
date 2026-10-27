const database = require('../database/db');
const crawler = require('../crawler/crawler');

const REFRESH_DAYS = 4;

function integerOption(value, name, minimum, maximum, fallback) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${name} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return result;
}

async function refreshCompletedTargets({ maxTargets, maxDepth, retryFailed, retryBlocked }) {
  const statuses = ['pending'];
  if (retryFailed) statuses.push('failed');
  if (retryBlocked) statuses.push('blocked');
  const pool = database.getPool();
  // Keep room for already queued targets before refreshing older profiles. The
  // bounded read avoids counting the entire historical queue on every run.
  const [queued] = await pool.execute(
    `SELECT id FROM iy_crawl_targets
     WHERE status IN (${statuses.map(() => '?').join(',')}) AND depth <= ?
       AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP())
     LIMIT ${maxTargets}`,
    [...statuses, maxDepth]
  );
  const capacity = maxTargets - queued.length;
  if (capacity <= 0) return 0;
  const [result] = await pool.execute(
    `UPDATE iy_crawl_targets
     SET status = 'pending', attempts = 0, next_attempt_at = NULL,
       last_error = NULL, updated_at = UTC_TIMESTAMP()
     WHERE status = 'done' AND depth <= ?
       AND updated_at <= UTC_TIMESTAMP() - INTERVAL ${REFRESH_DAYS} DAY
     ORDER BY updated_at ASC, id ASC LIMIT ${capacity}`,
    [maxDepth]
  );
  return Number(result.affectedRows || 0);
}

async function runFullSync(options = {}) {
  const params = {
    maxTargets: integerOption(options.maxTargets, 'maxTargets', 1, 1000, 100),
    maxDepth: integerOption(options.maxDepth, 'maxDepth', 0, 5, 2),
    delayMs: integerOption(options.delayMs, 'delayMs', 2000, 60000, 3000),
    retryFailed: options.retryFailed === undefined ? true : options.retryFailed === true,
    retryBlocked: options.retryBlocked === true,
  };
  console.log(`[ImportYeti][流程] 开始：环境 ${process.env.TASK_ENV}；单次最多 ${params.maxTargets} 个档案；深度 ${params.maxDepth}；请求间隔 ${params.delayMs}ms。`);
  console.log('[ImportYeti][建表] 检查数据表与查询索引。');
  await database.initializeSchema();
  const refreshed = await refreshCompletedTargets(params);
  console.log(`[ImportYeti][队列] 将 ${refreshed} 个至少 ${REFRESH_DAYS} 天未采集的已完成档案重新排队；优先保留已有队列的处理额度。`);
  const summary = await crawler.crawl({ ...params, returnSummary: true });
  console.log('[ImportYeti][概况] 当前数据库数据量估算：');
  await crawler.showStatus();
  console.log(`[ImportYeti][流程] 结果：成功 ${summary.succeeded}；失败 ${summary.failed}；访问受限 ${summary.blocked}；已保存队列状态。`);
  if (summary.blocked || summary.failed) {
    const message = summary.blocked
      ? `采集遇到访问限制，已暂停：${summary.stopReason}`
      : `采集有 ${summary.failed} 个档案失败（其中 ${summary.retryScheduled} 个等待退避重试）。`;
    throw new Error(`[ImportYeti][流程] ${message} 已入库的数据保留，下次从现有队列继续；受限目标需人工确认后显式重试。`);
  }
  if (!summary.processed) {
    console.log('[ImportYeti][流程] 没有到期且符合深度的可执行目标；首次使用需先通过 seed 添加公司或供应商档案链接。');
  }
  return { ...summary, refreshed };
}

module.exports = { runFullSync, refreshCompletedTargets, REFRESH_DAYS };
