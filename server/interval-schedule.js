const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const INTERVAL_DAYS = 4;
const INTERVAL_MS = INTERVAL_DAYS * 24 * 60 * 60 * 1000;

function firstRunAt(now = new Date()) {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(),
    shanghai.getUTCDate() + INTERVAL_DAYS) - 8 * 60 * 60 * 1000).toISOString();
}

function advanceRunAt(dueAt, now = new Date()) {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) throw new Error('ImportYeti 定时任务执行时间无效。');
  const steps = Math.max(1, Math.floor((now.getTime() - due) / INTERVAL_MS) + 1);
  return new Date(due + steps * INTERVAL_MS).toISOString();
}

function createIntervalState(projectRoot, environment) {
  const filePath = path.join(projectRoot, 'logs', 'tasks', 'schedulers', `importyeti-every-four-days-${environment}.json`);
  let state = {
    schemaVersion: 1, environment, enabled: environment === 'production',
    nextRunAt: null, lastTriggeredAt: null, lastRunStatus: null, lastError: null,
    retryNotBefore: null,
  };
  let loadError = null;

  function save(next) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, filePath);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    state = next;
    return { ...state };
  }

  try {
    let previous;
    try { previous = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous !== undefined) {
      if (!previous || previous.schemaVersion !== 1 || previous.environment !== environment ||
          typeof previous.enabled !== 'boolean' ||
          (previous.nextRunAt !== null && (typeof previous.nextRunAt !== 'string' || !Number.isFinite(Date.parse(previous.nextRunAt)))) ||
          (previous.retryNotBefore != null && (typeof previous.retryNotBefore !== 'string' || !Number.isFinite(Date.parse(previous.retryNotBefore))))) {
        throw new Error('状态文件格式无效。');
      }
      state = { ...state, ...previous };
      if (state.enabled && !state.nextRunAt) throw new Error('已启用的计划缺少执行时间。');
      if (['pending', 'running'].includes(state.lastRunStatus)) {
        save({ ...state, lastRunStatus: 'interrupted', lastError: 'API 重启前的定时触发未记录正常结束，请查看任务日志；下次执行时间保持原计划。' });
      }
    } else if (state.enabled) {
      save({ ...state, nextRunAt: firstRunAt() });
    }
  } catch (error) {
    loadError = `ImportYeti 定时计划读取或保存失败（${filePath}）：${error.message}`;
    state = { ...state, enabled: false, lastError: loadError };
    console.error('[task-runner]', loadError);
  }

  return {
    filePath,
    snapshot: () => ({ ...state }),
    update(patch) {
      if (loadError) throw Object.assign(new Error(loadError), { status: 503 });
      return save({ ...state, ...patch });
    },
  };
}

module.exports = { INTERVAL_DAYS, INTERVAL_MS, firstRunAt, advanceRunAt, createIntervalState };
