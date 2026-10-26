const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getRobotTask, validateRobotParams, assertRobotTaskAvailable, fixedFile } = require('./catalog');

const EVENT_PREFIX = '__ROBOT_EVENT__';
const LOCK_NAME = '.my-robot-task.lock';
const LISTS = [
  ['facebook', 'facebook/FBFriendLists.js'], ['instagram', 'ig/IGFriendLists.js'],
  ['tiktok', 'tt/FollowingListWebAlls.js'], ['email', 'email/emailLists.js'],
];
const FLAGS = ['hasUsed', 'hasUsed2', 'hasUsed3', 'hasChated', 'notFoundName', 'hasOverNumber', 'sendFailTip'];
const COUNTS = ['total', 'validRecords', 'invalidRecords', 'uniqueIdentities', 'missingIdentity', 'duplicates', 'conflictingIdentities', 'contradictoryRecords', 'invalidFlagValues'];
const CANDIDATES = ['expand', 'chat', 'emailFirst', 'emailSecond', 'emailThird'];

function acquireRobotLock(root, taskId) {
  const lockPath = path.join(root, LOCK_NAME);
  const token = crypto.randomUUID();
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, taskId, acquiredAt: new Date().toISOString() }));
    fs.closeSync(fd);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) { /* Already closed. */ }
      try { fs.unlinkSync(lockPath); } catch (_) { /* Preserve the original error. */ }
    }
    if (error.code === 'EEXIST') throw Object.assign(new Error('my-robot 已有磁盘运行锁；请等待任务结束。遗留锁需管理员核实后清理，不能自动抢占。'), { status: 409, robotCode: 'locked' });
    throw Object.assign(new Error('无法创建 my-robot 磁盘运行锁。'), { status: 503, robotCode: 'lockUnavailable' });
  }
  let released = false;
  return {
    release() {
      if (released) return;
      // Never remove a replacement lock, and never inspect or kill its PID.
      try {
        const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (owner.token !== token) throw new Error('lock-owner-changed');
        fs.unlinkSync(lockPath);
        released = true;
      } catch (error) {
        if (error.code === 'ENOENT') { released = true; return; }
        throw Object.assign(new Error('运行锁释放失败；请管理员核实运行状态后清理。'), { robotCode: 'lockReleaseFailed' });
      }
    },
  };
}

function readStrictNames(filename) {
  if (fs.statSync(filename).size > 64 * 1024 * 1024) throw new Error('list-too-large');
  const text = fs.readFileSync(filename, 'utf8');
  const match = text.match(/^\uFEFF?\s*exports\s*\.\s*names\s*=\s*([\s\S]*?)\s*;?\s*$/);
  if (!match) throw new Error('invalid-list-format');
  const names = JSON.parse(match[1]);
  if (!Array.isArray(names)) throw new Error('invalid-list-format');
  return names;
}

function identity(platform, record) {
  const value = platform === 'email' ? record.email : platform === 'facebook' ? record.href || record.name : platform === 'tiktok' ? record.uniqueId || record.name : record.name;
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function candidateFlags(platform, record) {
  if (platform === 'email') return { emailFirst: !record.hasUsed, emailSecond: !record.hasUsed2, emailThird: !record.hasUsed3 };
  return {
    expand: Boolean(platform === 'facebook' ? record.href && !record.hasUsed : platform === 'tiktok' ? record.uniqueId && !record.hasUsed && !record.notFoundName : record.name && !record.hasUsed),
    chat: Boolean(record.name && !record.hasChated && !record.notFoundName && (platform !== 'tiktok' || !record.sendFailTip)),
  };
}

function countNames(platform, names) {
  const result = Object.fromEntries(COUNTS.map(key => [key, 0]));
  result.total = names.length;
  result.legacyFlags = Object.fromEntries(FLAGS.map(key => [key, 0]));
  const candidates = platform === 'email' ? ['emailFirst', 'emailSecond', 'emailThird'] : ['expand', 'chat'];
  result.candidates = Object.fromEntries(candidates.map(key => [key, 0]));
  result.uniqueCandidates = { ...result.candidates };
  const identities = new Map();
  for (const record of names) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) { result.invalidRecords += 1; continue; }
    result.validRecords += 1;
    if (record.hasChated === true && (record.notFoundName === true || record.sendFailTip === true)) result.contradictoryRecords += 1;
    for (const flag of FLAGS) {
      if (record[flag] === true) result.legacyFlags[flag] += 1;
      if (record[flag] !== undefined && typeof record[flag] !== 'boolean') result.invalidFlagValues += 1;
    }
    const qualified = candidateFlags(platform, record);
    for (const key of candidates) if (qualified[key]) result.candidates[key] += 1;
    const key = identity(platform, record);
    if (!key) { result.missingIdentity += 1; continue; }
    const signature = JSON.stringify(FLAGS.map(flag => Boolean(record[flag])));
    if (identities.has(key)) {
      result.duplicates += 1;
      const previous = identities.get(key);
      previous.signatures.add(signature);
      for (const candidate of candidates) previous.candidates[candidate] ||= qualified[candidate];
    } else {
      identities.set(key, { signatures: new Set([signature]), candidates: qualified });
    }
  }
  result.uniqueIdentities = identities.size;
  for (const record of identities.values()) {
    if (record.signatures.size > 1) result.conflictingIdentities += 1;
    for (const key of candidates) if (record.candidates[key]) result.uniqueCandidates[key] += 1;
  }
  return result;
}

function inspectRobotLists(root) {
  return {
    platforms: LISTS.map(([platform, filename]) => {
      try {
        return { platform, available: true, ...countNames(platform, readStrictNames(fixedFile(root, filename))) };
      } catch (_) {
        return { platform, available: false, error: '固定名单缺失、不可读取、超出根目录或不是严格 JSON 数组赋值格式。' };
      }
    }),
  };
}

function safeCounts(value, keys) {
  return Object.fromEntries(keys.filter(key => Number.isSafeInteger(value?.[key]) && value[key] >= 0).map(key => [key, value[key]]));
}

function safeReport(report) {
  if (!Array.isArray(report?.platforms)) return null;
  return { platforms: LISTS.map(([platform]) => {
    const row = report.platforms.find(item => item?.platform === platform);
    if (!row?.available) return { platform, available: false, error: '固定名单缺失、不可读取、超出根目录或不是严格 JSON 数组赋值格式。' };
    return {
      platform, available: true, ...safeCounts(row, COUNTS),
      legacyFlags: safeCounts(row.legacyFlags, FLAGS),
      candidates: safeCounts(row.candidates, CANDIDATES),
      uniqueCandidates: safeCounts(row.uniqueCandidates, CANDIDATES),
    };
  }) };
}

function renderRobotEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.type === 'started') return '[客户开发] 已开始固定任务；脚本原始输出将被屏蔽，仅记录脱敏流程信息。\n';
  if (event.type === 'completed') {
    const counts = safeCounts(event.counts, ['submitted', 'scheduled', 'processed']);
    const labels = { submitted: '脚本报告的私信提交数', scheduled: '脚本报告的邮件预约数', processed: '脚本报告的种子处理数' };
    const detail = Object.entries(counts).map(([key, value]) => `${labels[key]} ${value}`).join('；');
    return `[客户开发] 脚本流程已结束${detail ? `；${detail}` : ''}；请核对平台结果，不能据此认定关注成功、消息已读或邮件送达。\n`;
  }
  if (event.type === 'stopped') return event.cleanupConfirmed === true
    ? '[客户开发] 收到终止请求，浏览器清理已确认并释放本次磁盘锁；已经发生的外部动作不能撤回，请核对结果。\n'
    : '[客户开发] 收到终止请求，浏览器清理结果未确认；保留磁盘锁，请管理员核实浏览器和名单状态后清理。已经发生的外部动作不能撤回。\n';
  if (event.type === 'progress' && Number.isSafeInteger(event.suppressedOutputChunks) && event.suppressedOutputChunks >= 0) return `[客户开发] 仍在执行，已屏蔽 ${event.suppressedOutputChunks} 段脚本原始输出。\n`;
  if (event.type === 'failed') {
    const messages = {
      locked: '已有 my-robot 磁盘运行锁，请等待任务结束；遗留锁需管理员核实后清理。',
      lockUnavailable: '无法创建 my-robot 磁盘运行锁。',
      lockReleaseFailed: '磁盘运行锁释放失败，请管理员核实运行状态后清理。',
      unavailable: '固定任务或目录不可用，请检查任务目录中的禁用原因。',
      invalidParams: '任务参数校验失败，任务未执行。',
      scriptFailed: '脚本执行失败，原始错误已屏蔽以保护账号和客户资料；请核对平台与本地名单状态。',
      cleanupUnconfirmed: '脚本执行失败且浏览器清理未确认；已保留磁盘锁，请管理员核实浏览器、外部动作和本地名单状态后清理。原始错误已屏蔽。',
    };
    return `[客户开发] ${messages[event.code] || messages.scriptFailed}\n`;
  }
  if (event.type === 'inspect') {
    const report = safeReport(event.report);
    return report ? `[客户开发][只读汇总] ${JSON.stringify(report)}\n[客户开发] 候选仅按本地字段静态筛选；历史标记不代表实际触达、有效客户或送达。\n` : '';
  }
  return '';
}

// Filter again in the parent before any persistence, including raw errors emitted
// by a dependency directly to a file descriptor instead of console/process.write.
function createRobotOutputFilter(onLog) {
  const buffers = { stdout: '', stderr: '' };
  return {
    write(stream, chunk) {
      if (!(stream in buffers)) return;
      buffers[stream] += String(chunk);
      let newline;
      while ((newline = buffers[stream].indexOf('\n')) !== -1) {
        const line = buffers[stream].slice(0, newline);
        buffers[stream] = buffers[stream].slice(newline + 1);
        if (line.length > 32000 || !line.startsWith(EVENT_PREFIX)) continue;
        try {
          const safe = renderRobotEvent(JSON.parse(line.slice(EVENT_PREFIX.length)));
          if (safe) onLog(stream, safe);
        } catch (_) { /* Untrusted output is never persisted. */ }
      }
      if (buffers[stream].length > 32000) buffers[stream] = '';
    },
  };
}

async function runRobotTask(taskId, params = {}, options = {}) {
  validateRobotParams(taskId, params);
  const { task, root } = assertRobotTaskAvailable(taskId);
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const emit = typeof options.onEvent === 'function' ? options.onEvent : event => originalStdout.call(process.stdout, `${EVENT_PREFIX}${JSON.stringify(event)}\n`);
  if (task.readOnly) {
    const report = inspectRobotLists(root);
    emit({ type: 'inspect', report });
    return report;
  }
  const lock = acquireRobotLock(root, taskId);
  let entry;
  let terminating = false;
  let retainLock = false;
  let cleanupUnconfirmed = false;
  let suppressedOutputChunks = 0;
  const suppress = function (_chunk, encoding, callback) {
    suppressedOutputChunks += 1;
    if (suppressedOutputChunks % 50 === 0) emit({ type: 'progress', suppressedOutputChunks });
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') done();
    return true;
  };
  const terminate = async () => {
    terminating = true;
    retainLock = true;
    let timeout;
    try {
      const confirmed = await Promise.race([
        Promise.resolve().then(() => typeof entry?.stopApp === 'function' ? entry.stopApp() : false),
        new Promise(resolve => { timeout = setTimeout(() => resolve(false), 8000); }),
      ]);
      if (confirmed === true && !cleanupUnconfirmed) {
        lock.release();
        emit({ type: 'stopped', cleanupConfirmed: true });
      } else {
        emit({ type: 'stopped', cleanupConfirmed: false });
      }
    } catch (_) {
      emit({ type: 'stopped', cleanupConfirmed: false });
    } finally {
      clearTimeout(timeout);
      process.exit(143);
    }
  };
  const onTerminate = () => { void terminate(); };
  process.once('SIGTERM', onTerminate);
  try {
    emit({ type: 'started' });
    process.stdout.write = suppress;
    process.stderr.write = suppress;
    entry = require(fixedFile(root, task.sourceScript));
    if (typeof entry.startApp !== 'function') throw new Error('invalid-entry-export');
    const counts = safeCounts(await entry.startApp(), ['submitted', 'scheduled', 'processed']);
    if (!terminating) emit({ type: 'completed', counts });
    return counts;
  } catch (error) {
    if (error?.cleanupUnconfirmed === true) {
      cleanupUnconfirmed = true;
      retainLock = true;
    }
    // Cancellation commonly rejects the active browser operation. The stop
    // handler alone reports its final cleanup outcome after stopApp settles.
    if (terminating) return {};
    const code = cleanupUnconfirmed ? 'cleanupUnconfirmed' : 'scriptFailed';
    emit({ type: 'failed', code });
    const message = cleanupUnconfirmed
      ? '客户开发脚本执行失败且浏览器清理未确认；已保留磁盘锁，请管理员核实浏览器、外部动作和本地名单状态后清理。'
      : '客户开发脚本执行失败；原始错误已屏蔽，请核对平台与本地名单状态。';
    throw Object.assign(new Error(message), { robotCode: code });
  } finally {
    if (!terminating) {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
    }
    process.removeListener('SIGTERM', onTerminate);
    if (!retainLock) lock.release();
  }
}

module.exports = { runRobotTask, inspectRobotLists, acquireRobotLock, createRobotOutputFilter, renderRobotEvent, LOCK_NAME, EVENT_PREFIX, getRobotTask };
