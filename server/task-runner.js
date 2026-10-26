const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { taskLogs, LOG_RELATIVE_DIRECTORY, LEGACY_LOG_RELATIVE_DIRECTORY } = require('./task-logs');
const { getRobotCatalog, getRobotTask, validateRobotParams, assertRobotTaskAvailable } = require('./robot/catalog');
const { createRobotOutputFilter } = require('./robot/runtime');
const batchStorage = require('../importgenius/storage/batches');
const { createBatchId, validateBatchId } = batchStorage;

const projectRoot = path.resolve(__dirname, '..');
const workerPath = path.join(__dirname, 'tasks', 'worker.js');
const MAX_LOG_CHARS = 64000;
const LOG_LINES = 300;
const SCHEDULER_CRON = '0 0 * * 0';
const SCHEDULER_TIMEZONE = 'Asia/Shanghai';
const TASKS = [
  { id: 'importgenius.fetch-importers', group: 'ImportGenius', name: '抓取 importer 列表', description: '新采集按上海日期和唯一批次保存指定页码，不覆盖历史列表；选择已有批次时只补未完成列表页，旧版数据可选 legacy。', params: ['country', 'pages', 'batchId'] },
  { id: 'importgenius.fetch-shipments', group: 'ImportGenius', name: '补充 shipment 明细', description: '读取选中采集批次的 importer JSON，补充当前站点的提单明细；同批次续跑跳过已完成记录，新批次不沿用旧批次详情。旧版数据可选 legacy。', params: ['country', 'pages', 'batchId'] },
  { id: 'importgenius.import-batch', group: 'ImportGenius', name: '批量写入 MySQL', description: '将选中采集批次（含 legacy 旧版数据）的指定页按公司 URL、提单号追加合并到 importgenius.raw；MySQL 自动计算商品描述，搜索侧表存在时同步描述。', params: ['country', 'pages', 'batchId'] },
  { id: 'importgenius.full-sync', group: 'ImportGenius', name: '完整采集流程', description: '新建独立采集批次，按列表、详情、入库顺序执行并保留历史 JSON；选择已有批次可跨日续跑，复用本批次已完成列表和详情，继续未完成阶段。', params: ['country', 'pages', 'batchId'] },
  { id: 'importyeti.init', group: '数据库', name: '创建 ImportYeti 缺失表并补齐查询索引', description: '作用于当前环境配置的 ImportYeti 数据库：创建缺失表，并补齐档案队列、公司/供应商和提单的查询索引，便于保存数据和搜索。已有大表建索引可能耗时较长并影响写入。', params: [] },
  { id: 'importyeti.crawl', group: 'ImportYeti', name: '采集排队的公司与供应商档案', description: '处理已有队列中、符合采集深度的公司和供应商档案，单次不超过上方采集上限；将档案、贸易关系及页面可见提单写入数据库，并把范围内的关联档案加入队列。遵守网站抓取规则，遇到访问限制时暂停。', params: ['maxTargets', 'maxDepth', 'delayMs', 'retryFailed', 'retryBlocked'] },
  { id: 'importyeti.enrich', group: 'ImportYeti', name: '用 ImportInfo 补充匹配提单', description: '读取上方填写的 ImportInfo 公司档案，仅更新按提单号匹配到的本库记录；补充缺失的国家、港口、货品描述等信息，并保存公开的 HS 编码和来源。未匹配或页面未公开的信息无法补充。', params: ['profileUrl'] },
  { id: 'importyeti.status', group: 'ImportYeti', name: '查看采集数据概况', description: '在运行日志中显示当前 ImportYeti 数据库的档案队列、公司/供应商和提单总量估算值；只读取数据，不会启动采集或更新记录。', params: [] },
  { id: 'importyeti.export', group: 'ImportYeti', name: '分块导出 CSV', description: '按主键分块读取并写出全部提单记录。', params: ['filename'] },
  { id: 'database.inspect', group: '数据库', name: '检查 ImportGenius 与 ImportYeti 数据库', description: '检查当前环境配置的 ImportGenius 和 ImportYeti 两个数据源，读取相关表的估算行数、存储占用和现有索引；分析列表翻页、商品搜索、采集队列等固定查询预计使用的索引，将结果输出到运行日志，帮助排查查询慢的原因。全程只读，不修改表、索引或业务数据。', params: [] },
  { id: 'database.ensure-indexes', group: 'ImportGenius', name: '盘点并补齐 ImportGenius 查询索引', description: '升级数据创建时间字段并补齐 ImportGenius 主表查询索引；从 importgenius.raw 分批回填历史描述到 importgenius_search，记录检查点，完成后创建全文索引，可续跑。同时检查并补齐 ImportYeti 查询索引。', params: [] },
  { id: 'tasks.cleanup-logs', group: '任务日志', name: '清理任务日志', description: '清理 logs/tasks/ 和旧 logs/scheduler/ 中超过保留天数的已结束日志；0 清理全部已结束日志，运行中的日志保留。', params: ['retentionDays'] },
];
const definitions = new Map([...TASKS, ...getRobotCatalog().tasks].map(task => [task.id, task]));
const runs = new Map();
const latestRunByTask = new Map();
let activeRunId = null;
let schedulerTask = null;
let schedulerEnabled = false;
let schedulerRunId = null;
let schedulerLastTriggeredAt = null;
let schedulerLastRunStatus = null;
let schedulerLastError = null;

function getEnvironment() {
  return ['local', 'production'].includes(process.env.TASK_ENV) ? process.env.TASK_ENV : 'unknown';
}

function canonicalTaskId(taskId) {
  return taskId === 'scheduler.cleanup-logs' ? 'tasks.cleanup-logs' : taskId;
}

function effectiveParams(taskId, params) {
  const result = JSON.parse(JSON.stringify(params));
  if (taskId.startsWith('importgenius.')) {
    if (typeof result.country === 'string') result.country = result.country.trim().toLowerCase();
    if (Array.isArray(result.pages)) result.pages = [...new Set(result.pages)].sort((left, right) => left - right);
    const createsBatch = ['importgenius.fetch-importers', 'importgenius.full-sync'].includes(taskId);
    if (result.batchId !== undefined) {
      result.batchId = validateBatchId(result.batchId);
      result.batchMode = 'resume';
    } else if (createsBatch) {
      result.batchId = createBatchId();
      result.batchMode = 'new';
    }
    if (result.cleanup === true) throw Object.assign(new Error('采集批次用于保留历史快照，不支持自动删除 JSON checkpoint。'), { status: 400 });
    delete result.refreshList;
    delete result.cleanup;
  }
  if (taskId === 'importgenius.full-sync') {
    result.countries = (Array.isArray(result.countries) && result.countries.length ? result.countries : [result.country])
      .map(country => typeof country === 'string' ? country.trim().toLowerCase() : country);
  }
  if (taskId === 'tasks.cleanup-logs' && result.retentionDays === undefined) result.retentionDays = 30;
  return result;
}

function reportLogError(run, error) {
  if (!run.logPersistenceError) {
    console.error(`[task-runner] 任务日志写入失败（${run.runId}）：`, error.message);
  }
  run.logPersistenceError = error.message;
}

function pushLog(run, stream, chunk) {
  if (run.logRecord) {
    run.logRecord.append(stream, chunk).catch(error => reportLogError(run, error));
  } else if (run.pendingLogChunks) {
    run.pendingLogChunks.push({ stream, chunk });
  }
  if (typeof run.onLog === 'function') run.onLog(stream, chunk);
  run.logBuffer += chunk;
  const lines = run.logBuffer.split(/\r?\n/);
  run.logBuffer = lines.pop() || '';
  for (const line of lines) {
    run.logs.push({ at: new Date().toISOString(), stream, text: line.slice(0, 4000) });
  }
  while (run.logBuffer.length > 4000) {
    run.logs.push({ at: new Date().toISOString(), stream, text: run.logBuffer.slice(0, 4000) });
    run.logBuffer = run.logBuffer.slice(4000);
  }
  if (run.logs.length > LOG_LINES) run.logs.splice(0, run.logs.length - LOG_LINES);
  let total = run.logs.reduce((sum, line) => sum + line.text.length, 0) + run.logBuffer.length;
  while (total > MAX_LOG_CHARS && run.logs.length > 1) {
    total -= run.logs.shift().text.length;
  }
}

function summarize(run) {
  return {
    runId: run.runId,
    logId: run.logRecord?.id || null,
    triggerType: run.triggerType,
    taskId: run.taskId,
    params: run.params,
    batchId: run.params?.batchId || null,
    batchMode: run.params?.batchMode || null,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    exitCode: run.exitCode,
    error: run.error,
    logPersistenceError: run.logPersistenceError || null,
    stopRequestedAt: run.stopRequestedAt || null,
    logs: run.logs.slice(-80),
  };
}

async function acquireTaskLocks(taskId) {
  const resources = taskId === 'database.ensure-indexes'
    ? ['importgenius', 'importyeti']
    : taskId.startsWith('importgenius.')
      ? ['importgenius']
      : taskId.startsWith('importyeti.') && taskId !== 'importyeti.status'
        ? ['importyeti']
        : [];
  const connections = [];
  try {
    for (const resource of resources) {
      const db = resource === 'importgenius' ? require('../importgenius/database/db') : require('../importyeti/database/db');
      const connection = await db.getPool().getConnection();
      const lockName = `import-data:${resource}:task-runner`;
      connections.push({ connection, lockName });
      const [rows] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
      if (Number(rows[0]?.acquired) !== 1) {
        throw Object.assign(new Error(`${resource} 数据源已有任务在另一服务实例运行。`), { status: 409 });
      }
    }
    return connections;
  } catch (error) {
    await releaseTaskLocks(connections);
    if (error.status) throw error;
    throw Object.assign(new Error(`无法获取任务数据库锁：${error.message}`), { status: 503 });
  }
}

async function releaseTaskLocks(locks = []) {
  for (const { connection, lockName } of [...locks].reverse()) {
    try {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    } catch (_) {
      // Releasing the connection also releases a MySQL named lock if the server ended it.
    } finally {
      connection.release();
    }
  }
}

async function runTask(taskId, params = {}, options = {}) {
  taskId = canonicalTaskId(taskId);
  if (!definitions.has(taskId)) throw Object.assign(new Error('未知任务。'), { status: 404 });
  if (getEnvironment() === 'unknown') throw Object.assign(new Error('后端 TASK_ENV 未配置为 local 或 production。'), { status: 503 });
  if (getRobotTask(taskId)) {
    params = validateRobotParams(taskId, params);
    assertRobotTaskAvailable(taskId);
  }
  const triggerType = options.scheduled ? 'scheduled' : 'manual';
  const triggeredAt = new Date().toISOString();
  const runParams = effectiveParams(taskId, params);
  if (taskId.startsWith('importgenius.')) runParams.batchSource = triggerType;
  if (activeRunId) {
    const blockedByRunId = activeRunId;
    const message = '已有任务正在运行，本次执行已跳过，请等待完成。';
    let record;
    try {
      record = options.logRecord || options.scheduleRecord || await createTaskRecord(taskId, runParams, triggeredAt, triggerType);
      await record.append('stderr', `[task-runner][跳过] ${message} 运行 ID ${blockedByRunId}。\n`);
      await record.update({ status: 'skipped', finishedAt: new Date().toISOString(), error: message, blockedByRunId });
      await record.flush();
    } catch (error) {
      console.error('[task-runner] 任务跳过日志保存失败:', error.message);
      throw Object.assign(new Error('已有任务正在运行，且本次跳过日志保存失败。'), { status: 503 });
    }
    throw Object.assign(new Error(message), { status: 409, logId: record.id });
  }

  if (taskId.startsWith('importgenius.')) {
    if (['importgenius.fetch-shipments', 'importgenius.import-batch'].includes(taskId) && !runParams.batchId) {
      throw Object.assign(new Error('请先选择采集批次；旧版平铺 JSON 请选择 legacy 历史数据。'), { status: 400 });
    }
  }

  const runId = crypto.randomUUID();
  const run = {
    runId,
    taskId,
    params: runParams,
    logRecord: options.logRecord || options.scheduleRecord || null,
    pendingLogChunks: [],
    triggerType,
    triggeredAt,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    error: null,
    logs: [],
    logBuffer: '',
    onLog: typeof options.onLog === 'function' ? options.onLog : null,
    completion: null,
    resolveCompletion: null,
  };
  run.completion = new Promise(resolve => { run.resolveCompletion = resolve; });
  runs.set(runId, run);
  latestRunByTask.set(taskId, runId);
  activeRunId = runId;
  if (options.scheduled) {
    schedulerRunId = runId;
    schedulerLastRunStatus = run.status;
    schedulerLastError = null;
  }
  try {
    if (!run.logRecord) {
      run.logRecord = await createTaskRecord(taskId, runParams, triggeredAt, triggerType);
    }
    for (const pending of run.pendingLogChunks) {
      run.logRecord.append(pending.stream, pending.chunk).catch(error => reportLogError(run, error));
    }
    run.pendingLogChunks = null;
    await run.logRecord.update({
      runId, startedAt: run.startedAt, status: run.status, triggerType,
      params: runParams, stopRequestedAt: run.stopRequestedAt || null,
    });
    pushLog(run, 'stdout', `[task-runner][开始] ${definitions.get(taskId).name}；触发方式 ${triggerType}；运行 ID ${runId}；参数 ${JSON.stringify(runParams)}。\n`);
    await run.logRecord.flush();
    run.logInitialized = true;
    if (!run.stopRequested && taskId.startsWith('importgenius.') && runParams.batchMode === 'resume') {
      const countries = runParams.countries || [runParams.country];
      for (const country of countries) {
        await batchStorage.openBatch(country, runParams.batchId, { pages: runParams.pages, environment: getEnvironment() });
      }
    }
    if (!run.stopRequested) run.distributedLocks = await acquireTaskLocks(taskId);
  } catch (error) {
    if (!run.logInitialized) {
      reportLogError(run, error);
      error = Object.assign(new Error('无法保存任务日志，任务未启动。'), { status: 503 });
    }
    if (run.stopRequested) {
      run.status = 'stopped';
      pushLog(run, 'stdout', '[task-runner][终止] 任务在启动前已取消。\n');
      await finishRun(run);
      return summarize(run);
    }
    run.status = 'failed';
    run.error = error.message;
    pushLog(run, 'stderr', `[task-runner] 任务启动失败：${error.message}\n`);
    await finishRun(run);
    throw error;
  }

  if (run.stopRequested) {
    run.status = 'stopped';
    pushLog(run, 'stdout', '[task-runner][终止] 任务在启动前已取消，未创建子进程。\n');
    await finishRun(run);
    return summarize(run);
  }

  let child;
  try {
    child = spawn(process.execPath, [workerPath, taskId, JSON.stringify(runParams)], {
      cwd: projectRoot,
      shell: false,
      env: {
        ...process.env,
        TASK_ENV: getEnvironment(),
        ENV: getEnvironment() === 'production' ? 'production' : 'dev',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.child = child;
  } catch (error) {
    run.status = 'failed';
    run.error = error.message;
    pushLog(run, 'stderr', `[task-runner] 子进程启动失败：${error.message}\n`);
    await finishRun(run);
    return summarize(run);
  }
  const timeoutMs = Math.max(60000, Math.min(24 * 60 * 60 * 1000, Number(process.env.TASK_RUN_TIMEOUT_MS || 12 * 60 * 60 * 1000)));
  run.timeoutId = setTimeout(() => {
    run.timedOut = true;
    run.status = 'stopping';
    run.error = `任务超过最长运行时间 ${(timeoutMs / 3600000).toFixed(1)} 小时。`;
    pushLog(run, 'stderr', `[task-runner][超时] ${run.error} 发送 SIGTERM，等待子进程退出。\n`);
    if (run.logRecord) {
      run.logRecord.update({ status: 'stopping', error: run.error, timedOut: true }).catch(error => reportLogError(run, error));
    }
    try {
      if (!child.kill('SIGTERM')) pushLog(run, 'stderr', '[task-runner][超时] 子进程未接受 SIGTERM。\n');
    } catch (error) {
      pushLog(run, 'stderr', `[task-runner][超时] 发送 SIGTERM 失败：${error.message}\n`);
    }
    run.killTimeoutId = setTimeout(() => {
      if (run.finishedAt || child.exitCode != null || child.signalCode) return;
      pushLog(run, 'stderr', '[task-runner][超时] 子进程 10 秒内未退出，发送 SIGKILL。\n');
      try { child.kill('SIGKILL'); } catch (error) {
        pushLog(run, 'stderr', `[task-runner][超时] 发送 SIGKILL 失败：${error.message}\n`);
      }
    }, 10000);
    run.killTimeoutId.unref?.();
  }, timeoutMs);
  run.timeoutId.unref?.();
  child.stdout.setEncoding?.('utf8');
  child.stderr.setEncoding?.('utf8');
  const robotOutput = getRobotTask(taskId) ? createRobotOutputFilter((stream, chunk) => pushLog(run, stream, chunk)) : null;
  child.stdout.on('data', data => robotOutput ? robotOutput.write('stdout', data) : pushLog(run, 'stdout', String(data)));
  child.stderr.on('data', data => robotOutput ? robotOutput.write('stderr', data) : pushLog(run, 'stderr', String(data)));
  child.on('error', error => {
    pushLog(run, 'stderr', `[task-runner] 子进程错误：${error.message}\n`);
    if (!child.pid) {
      run.status = 'failed';
      run.error = error.message;
    }
  });
  child.on('close', (code, signal) => {
    if (run.finishedAt) return;
    run.exitCode = code;
    if (run.timedOut) {
      run.status = 'failed';
    } else if (run.stopRequested) {
      run.status = 'stopped';
      run.error = null;
    } else if (run.status !== 'failed') {
      run.status = code === 0 ? 'success' : 'failed';
      if (signal) run.error = `任务被信号 ${signal} 终止。`;
      else if (code !== 0) run.error = `任务退出码：${code}`;
    }
    if (run.logBuffer) {
      run.logs.push({ at: new Date().toISOString(), stream: 'stdout', text: run.logBuffer.slice(0, 4000) });
      run.logBuffer = '';
    }
    if (run.status === 'stopped') {
      pushLog(run, 'stdout', `[task-runner][终止] 子进程已退出${signal ? `（${signal}）` : ''}，任务已终止。\n`);
    }
    finishRun(run).catch(finishError => console.error('[task-runner] finish failed:', finishError.message));
  });
  return summarize(run);
}

async function finishRun(run) {
  if (run.finishedAt) return run.completion;
  run.finishedAt = new Date().toISOString();
  run.durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  pushLog(run, run.status === 'failed' ? 'stderr' : 'stdout', `[task-runner][结束] 状态 ${run.status}；耗时 ${run.durationMs} ms；退出码 ${run.exitCode ?? '无'}${run.error ? `；${run.error}` : ''}。\n`);
  clearTimeout(run.timeoutId);
  clearTimeout(run.killTimeoutId);
  try {
    await releaseTaskLocks(run.distributedLocks);
  } catch (error) {
    console.error('[task-runner] lock release failed:', error.message);
  }
  run.distributedLocks = [];
  run.child = null;
  if (run.logRecord) {
    try {
      await run.logRecord.update({
        status: run.status, finishedAt: run.finishedAt, durationMs: run.durationMs,
        exitCode: run.exitCode, error: run.error,
        stopRequestedAt: run.stopRequestedAt || null,
        logPersistenceError: run.logPersistenceError || null,
      });
      await run.logRecord.flush();
    } catch (error) {
      reportLogError(run, error);
      try {
        // flush() retains the first queue failure; a later durable update can
        // still expose that loss after disk writes recover.
        await run.logRecord.update({ logPersistenceError: run.logPersistenceError });
      } catch (metadataError) {
        console.error(`[task-runner] 日志写入异常标记保存失败（${run.runId}）：`, metadataError.message);
      }
    }
  }
  if (activeRunId === run.runId) activeRunId = null;
  if (schedulerRunId === run.runId) {
    schedulerRunId = null;
    schedulerLastRunStatus = run.status;
    schedulerLastError = run.error || run.logPersistenceError || null;
  }
  run.onLog = null;
  run.resolveCompletion?.(summarize(run));
  return summarize(run);
}

async function stopTask(taskId, runId) {
  taskId = canonicalTaskId(taskId);
  const run = runs.get(runId);
  if (!run || run.taskId !== taskId) {
    throw Object.assign(new Error('找不到此任务运行记录。'), { status: 404 });
  }
  if (run.status !== 'running' || run.finishedAt) return summarize(run);
  const child = run.child;
  if (child && (child.exitCode != null || child.signalCode)) return summarize(run);

  run.stopRequested = true;
  run.stopRequestedAt = new Date().toISOString();
  run.status = 'stopping';
  pushLog(run, 'stdout', `[task-runner][终止] 收到终止请求：${taskId}；运行 ID ${runId}。\n`);

  if (child) {
    try {
      if (!child.kill('SIGTERM')) throw new Error('子进程未接受终止信号，请刷新任务状态。');
    } catch (error) {
      run.stopRequested = false;
      run.stopRequestedAt = null;
      run.status = 'running';
      pushLog(run, 'stderr', `[task-runner][终止] 发送 SIGTERM 失败：${error.message}\n`);
      throw Object.assign(new Error(`终止任务失败：${error.message}`), { status: 409 });
    }
    clearTimeout(run.timeoutId);
    pushLog(run, 'stdout', '[task-runner][终止] 已发送 SIGTERM，正在等待子进程退出。\n');
    run.killTimeoutId = setTimeout(() => {
      if (run.finishedAt || child.exitCode != null || child.signalCode) return;
      pushLog(run, 'stderr', '[task-runner][终止] 子进程 10 秒内未退出，发送 SIGKILL。\n');
      try {
        child.kill('SIGKILL');
      } catch (error) {
        pushLog(run, 'stderr', `[task-runner][终止] 发送 SIGKILL 失败：${error.message}\n`);
      }
    }, 10000);
    run.killTimeoutId.unref?.();
  }
  if (run.logRecord && !run.finishedAt) {
    run.logRecord.update({ status: run.status, stopRequestedAt: run.stopRequestedAt }).catch(error => reportLogError(run, error));
  }
  return summarize(run);
}

function getNextSundayMidnight() {
  const now = new Date();
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULER_TIMEZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now).reduce((parts, part) => ({ ...parts, [part.type]: Number(part.value) }), {});
  const midnightUtc = Date.UTC(local.year, local.month - 1, local.day) - 8 * 60 * 60 * 1000;
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const addDays = (7 - weekday) % 7;
  let next = midnightUtc + addDays * 24 * 60 * 60 * 1000;
  if (next <= now.getTime()) next += 7 * 24 * 60 * 60 * 1000;
  return new Date(next).toISOString();
}

function createTaskRecord(taskId, params, triggeredAt, triggerType) {
  return taskLogs.createRecord({
    taskId, taskName: definitions.get(taskId).name, environment: getEnvironment(),
    ...(triggerType === 'scheduled' ? { cron: SCHEDULER_CRON } : {}),
    timezone: SCHEDULER_TIMEZONE, triggeredAt, triggerType,
    params, status: 'pending', runId: null, startedAt: null, finishedAt: null,
    durationMs: null, exitCode: null, error: null,
  });
}

function initializeScheduler() {
  if (schedulerTask || getEnvironment() === 'unknown') return;
  schedulerEnabled = getEnvironment() === 'production';
  schedulerTask = cron.schedule(SCHEDULER_CRON, async () => {
    schedulerLastTriggeredAt = new Date().toISOString();
    schedulerLastError = null;
    const triggeredAt = schedulerLastTriggeredAt;
    const countries = getEnvironment() === 'local'
      ? ['usa']
      : ['usa', 'india', 'vietnam', 'argentina', 'chile', 'colombia', 'costarica', 'ecuador', 'panama', 'peru', 'paraguay', 'uruguay', 'venezuela'];
    const params = { countries, pages: Array.from({ length: 10 }, (_, index) => index + 1) };
    let record;
    try {
      record = await createTaskRecord('importgenius.full-sync', params, triggeredAt, 'scheduled');
      if (activeRunId) {
        const blockedByRunId = activeRunId;
        const skipReason = '触发时已有任务运行，本轮已跳过。';
        schedulerLastRunStatus = 'skipped';
        schedulerLastError = skipReason;
        const finishedAt = new Date().toISOString();
        await record.append('stderr', `[task-runner] ${skipReason}\n`);
        await record.update({ status: 'skipped', finishedAt, error: skipReason, blockedByRunId });
        await record.flush();
        console.warn('[task-runner] 周定时触发时已有任务运行，本次跳过。');
        return;
      }
      await runTask(
        'importgenius.full-sync',
        params,
        { scheduled: true, scheduleRecord: record }
      );
    } catch (error) {
      schedulerLastRunStatus = 'failed';
      schedulerLastError = error.message;
      console.error('[task-runner] 周定时任务未启动:', error.message);
      if (record) {
        try {
          await record.update({ status: 'failed', finishedAt: new Date().toISOString(), error: error.message });
          await record.flush();
        } catch (logError) {
          console.error('[task-runner] 定时触发失败记录写入失败:', logError.message);
        }
      }
    }
  }, { scheduled: schedulerEnabled, timezone: SCHEDULER_TIMEZONE });
}

function setScheduler(action) {
  if (!schedulerTask) initializeScheduler();
  if (!schedulerTask) throw Object.assign(new Error('当前环境未初始化定时器。'), { status: 503 });
  if (action === 'start') {
    schedulerTask.start();
    schedulerEnabled = true;
  } else if (action === 'stop') {
    schedulerTask.stop();
    schedulerEnabled = false;
  } else {
    throw Object.assign(new Error('操作仅支持 start 或 stop。'), { status: 400 });
  }
  return getSchedulerStatus();
}

function getSchedulerStatus() {
  return {
    enabled: schedulerEnabled,
    cron: SCHEDULER_CRON,
    timezone: SCHEDULER_TIMEZONE,
    logDirectory: LOG_RELATIVE_DIRECTORY,
    legacyLogDirectory: LEGACY_LOG_RELATIVE_DIRECTORY,
    nextRunAt: schedulerEnabled ? getNextSundayMidnight() : null,
    running: Boolean(schedulerRunId),
    activeRunId: schedulerRunId,
    lastTriggeredAt: schedulerLastTriggeredAt,
    lastRunStatus: schedulerLastRunStatus,
    lastError: schedulerLastError,
  };
}

function getCatalog() {
  const robotCatalog = getRobotCatalog();
  return {
    environment: getEnvironment(),
    productionControlConfigured: Boolean(process.env.TASK_CONTROL_TOKEN),
    serverTime: new Date().toISOString(),
    activeRunId,
    logDirectory: LOG_RELATIVE_DIRECTORY,
    legacyLogDirectory: LEGACY_LOG_RELATIVE_DIRECTORY,
    scheduler: getSchedulerStatus(),
    robot: robotCatalog.robot,
    tasks: [...TASKS, ...robotCatalog.tasks].map(task => ({
      ...task,
      latestRun: latestRunByTask.has(task.id) ? summarize(runs.get(latestRunByTask.get(task.id))) : null,
    })),
  };
}

function getRun(taskId, runId) {
  taskId = canonicalTaskId(taskId);
  const run = runs.get(runId);
  if (!run || run.taskId !== taskId) throw Object.assign(new Error('找不到此任务运行记录。'), { status: 404 });
  return summarize(run);
}

function waitForRun(taskId, runId) {
  taskId = canonicalTaskId(taskId);
  const run = runs.get(runId);
  if (!run || run.taskId !== taskId) throw Object.assign(new Error('找不到此任务运行记录。'), { status: 404 });
  return run.completion;
}

function isWriteEnvironmentConfigured() {
  return getEnvironment() !== 'unknown';
}

initializeScheduler();

module.exports = { getCatalog, getRun, runTask, stopTask, waitForRun, setScheduler, getEnvironment, isWriteEnvironmentConfigured };
