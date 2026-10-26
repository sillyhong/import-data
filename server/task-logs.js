const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const LOG_RELATIVE_DIRECTORY = 'logs/tasks';
const LEGACY_LOG_RELATIVE_DIRECTORY = 'logs/scheduler';
const PROJECT_DIRECTORY = path.resolve(__dirname, '..');
const LOG_VERSION = 1;
const ACTIVE_STATUSES = new Set(['pending', 'running', 'stopping']);
const TERMINAL_STATUSES = new Set(['success', 'failed', 'stopped', 'skipped', 'start_failed', 'interrupted']);
const METADATA_FILENAME = /^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/i;
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_LABELS = { importgenius: 'ImportGenius', importyeti: 'ImportYeti', database: '数据库', robot: '客户开发', maintenance: '任务维护', other: '其他' };
const TRIGGER_TYPE_LABELS = { manual: '手动执行', scheduled: '定时触发' };
const STATUS_LABELS = { pending: '待启动', running: '运行中', stopping: '终止中', success: '成功', failed: '失败', stopped: '已终止', skipped: '已跳过', start_failed: '启动失败', interrupted: '已中断' };
const ENVIRONMENT_LABELS = { local: '本地', production: '生产', unknown: '未知' };
const COUNTRY_LABELS = { usa: '美国', india: '印度', vietnam: '越南', argentina: '阿根廷', chile: '智利', colombia: '哥伦比亚', costarica: '哥斯达黎加', ecuador: '厄瓜多尔', panama: '巴拿马', peru: '秘鲁', paraguay: '巴拉圭', uruguay: '乌拉圭', venezuela: '委内瑞拉' };
const OUTPUT_SCAN_BUDGET = 1024 * 1024;
const OUTPUT_TEXT_BUDGET = 256 * 1024;
const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

function securityError(message) {
  const error = new Error(message);
  error.code = 'ERR_UNSAFE_SCHEDULER_LOG_PATH';
  return error;
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function snapshot(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const serialized = JSON.stringify(value);
  const result = JSON.parse(serialized);
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError(`${label} must serialize to an object`);
  }
  return result;
}

function dateValue(value) {
  if (value === undefined || value === null || value === '') return NaN;
  return new Date(value).getTime();
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function queryError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function decorateRecord(metadata) {
  const prefix = metadata.taskId.split('.')[0];
  const category = ['tasks', 'scheduler'].includes(prefix) ? 'maintenance' : Object.hasOwn(CATEGORY_LABELS, prefix) ? prefix : 'other';
  const countries = [...new Set([
    ...(typeof metadata.params?.country === 'string' ? [metadata.params.country] : []),
    ...(Array.isArray(metadata.params?.countries) ? metadata.params.countries.filter(value => typeof value === 'string') : []),
  ].map(value => value.toLowerCase()))];
  return { ...metadata, triggerType: metadata.triggerType || 'scheduled', category, categoryLabel: CATEGORY_LABELS[category], countries };
}

function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '' || cursor === 0) return { offset: 0, textOffset: 0 };
  if (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw queryError('日志分页游标无效。');
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(value.offset) || value.offset < 0 || !Number.isSafeInteger(value.textOffset) || value.textOffset < 0) throw new Error('Invalid cursor');
    return { offset: value.offset, textOffset: value.textOffset };
  } catch (_) {
    throw queryError('日志分页游标无效。');
  }
}

function encodeCursor(offset, textOffset) {
  return Buffer.from(JSON.stringify({ offset, textOffset })).toString('base64url');
}

function textSegment(text, start, maxBytes) {
  let low = start;
  let high = Math.min(text.length, start + maxBytes);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(start, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  if (low < text.length && low > start && /[\uD800-\uDBFF]/.test(text[low - 1])) low -= 1;
  return text.slice(start, low);
}

async function safeFile(filePath, expected) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (expected && !sameFile(stat, expected))) {
    throw securityError(`Scheduler log must remain a regular, unlinked file: ${filePath}`);
  }
  return stat;
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function createTaskLogStore({ directory } = {}) {
  if (directory !== undefined && (typeof directory !== 'string' || !directory.trim())) {
    throw new TypeError('directory must be a nonempty path');
  }
  const requestedDirectory = path.resolve(directory || path.join(PROJECT_DIRECTORY, LOG_RELATIVE_DIRECTORY));
  const relativeDirectories = directory === undefined ? [LOG_RELATIVE_DIRECTORY, LEGACY_LOG_RELATIVE_DIRECTORY] : [LOG_RELATIVE_DIRECTORY];
  const locationPromises = new Map();

  async function location(relativeDirectory = LOG_RELATIVE_DIRECTORY) {
    if (!locationPromises.has(relativeDirectory)) {
      locationPromises.set(relativeDirectory, (async () => {
        let anchor;
        let relative;
        if (directory === undefined) {
          anchor = await fs.realpath(PROJECT_DIRECTORY);
          relative = relativeDirectory;
        } else if (within(path.resolve(os.tmpdir()), requestedDirectory)) {
          // macOS exposes its temporary directory through the system /var alias.
          anchor = await fs.realpath(os.tmpdir());
          relative = path.relative(path.resolve(os.tmpdir()), requestedDirectory);
        } else {
          anchor = path.parse(requestedDirectory).root;
          relative = path.relative(anchor, requestedDirectory);
        }
        return { anchor, relative, directory: path.join(anchor, relative) };
      })());
    }
    return locationPromises.get(relativeDirectory);
  }

  async function ensureDirectory(create, relativeDirectory = LOG_RELATIVE_DIRECTORY) {
    const destination = await location(relativeDirectory);
    const anchorStat = await fs.lstat(destination.anchor);
    if (!anchorStat.isDirectory() || anchorStat.isSymbolicLink()) {
      throw securityError(`Unsafe scheduler log directory: ${destination.anchor}`);
    }
    let current = destination.anchor;
    for (const part of destination.relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      let stat;
      try {
        stat = await fs.lstat(current);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (!create) return null;
        try {
          await fs.mkdir(current, { mode: 0o700 });
        } catch (mkdirError) {
          if (mkdirError.code !== 'EEXIST') throw mkdirError;
        }
        stat = await fs.lstat(current);
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw securityError(`Unsafe scheduler log directory: ${current}`);
      }
    }
    return destination.directory;
  }

  async function atomicMetadataWrite(metadataPath, metadata, expected) {
    const targetDirectory = await ensureDirectory(true);
    if (expected) await safeFile(metadataPath, expected);
    const temporaryPath = path.join(targetDirectory, `.scheduler-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await fs.open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await ensureDirectory(true);
      if (expected) await safeFile(metadataPath, expected);
      else {
        try {
          await fs.lstat(metadataPath);
          throw securityError(`Scheduler log already exists: ${metadataPath}`);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      await fs.rename(temporaryPath, metadataPath);
      await syncDirectory(targetDirectory);
      return safeFile(metadataPath);
    } finally {
      if (handle) await handle.close();
      await fs.unlink(temporaryPath).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  async function createRecord(metadata) {
    const supplied = snapshot(metadata, 'metadata');
    const id = randomUUID();
    const triggeredAt = supplied.triggeredAt || new Date().toISOString();
    const triggerTime = dateValue(triggeredAt);
    if (!Number.isFinite(triggerTime)) throw new TypeError('triggeredAt must be a valid date');
    const parts = shanghaiDate.formatToParts(new Date(triggerTime));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const basename = `${values.year}-${values.month}-${values.day}_${id}`;
    const targetDirectory = await ensureDirectory(true);
    const metadataPath = path.join(targetDirectory, `${basename}.json`);
    const outputPath = path.join(targetDirectory, `${basename}.jsonl`);
    if (supplied.triggerType !== undefined && (typeof supplied.triggerType !== 'string' || !Object.hasOwn(TRIGGER_TYPE_LABELS, supplied.triggerType))) throw new TypeError('triggerType must be manual or scheduled');
    let currentMetadata = { status: 'pending', triggerType: 'manual', ...supplied, triggeredAt, id, schedulerLogVersion: LOG_VERSION };
    let metadataIdentity;
    const outputHandle = await fs.open(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const outputIdentity = await outputHandle.stat();
    try {
      await outputHandle.sync();
    } finally {
      await outputHandle.close();
    }
    try {
      metadataIdentity = await atomicMetadataWrite(metadataPath, currentMetadata);
    } catch (error) {
      await safeFile(outputPath, outputIdentity).then(() => fs.unlink(outputPath)).catch(() => {});
      throw error;
    }

    let tail = Promise.resolve();
    let firstFailure;
    function enqueue(operation) {
      const result = tail.then(operation);
      tail = result.catch(error => { if (!firstFailure) firstFailure = error; });
      return result;
    }

    return {
      id,
      metadataPath,
      outputPath,
      append(stream, text) {
        const at = new Date().toISOString();
        if (typeof stream !== 'string' || typeof text !== 'string') {
          return enqueue(async () => { throw new TypeError('stream and text must be strings'); });
        }
        return enqueue(async () => {
          await ensureDirectory(true);
          await safeFile(outputPath, outputIdentity);
          const handle = await fs.open(outputPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
          try {
            const actual = await handle.stat();
            if (!actual.isFile() || actual.nlink !== 1 || !sameFile(actual, outputIdentity)) {
              throw securityError(`Scheduler output file changed: ${outputPath}`);
            }
            await handle.writeFile(`${JSON.stringify({ at, stream, text })}\n`, 'utf8');
            await handle.sync();
          } finally {
            await handle.close();
          }
        });
      },
      update(patch) {
        let changes;
        try {
          changes = snapshot(patch, 'patch');
        } catch (error) {
          return enqueue(async () => { throw error; });
        }
        return enqueue(async () => {
          const nextMetadata = { ...currentMetadata, ...changes, id, schedulerLogVersion: LOG_VERSION };
          metadataIdentity = await atomicMetadataWrite(metadataPath, nextMetadata, metadataIdentity);
          currentMetadata = nextMetadata;
        });
      },
      async flush() {
        await tail;
        if (firstFailure) throw firstFailure;
      },
    };
  }

  async function readMetadata(targetDirectory, filename) {
    try {
      return await readMetadataAttempt(targetDirectory, filename);
    } catch (error) {
      if (error.code !== 'ERR_SCHEDULER_LOG_CHANGED') throw error;
      // The writer replaces metadata atomically while a scheduled task is active.
      return readMetadataAttempt(targetDirectory, filename);
    }
  }

  async function readMetadataAttempt(targetDirectory, filename) {
    const match = METADATA_FILENAME.exec(filename);
    if (!match) throw queryError('日志记录不存在。', 404);
    const metadataPath = path.join(targetDirectory, filename);
    const identity = await safeFile(metadataPath);
    if (identity.size > 1024 * 1024) throw new Error('Scheduler metadata exceeds the read limit');
    const handle = await fs.open(metadataPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let metadata;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1) throw securityError('Scheduler metadata is not a regular file');
      if (!sameFile(opened, identity)) {
        throw Object.assign(new Error('Scheduler metadata changed while reading'), { code: 'ERR_SCHEDULER_LOG_CHANGED' });
      }
      metadata = JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
        metadata.schedulerLogVersion !== LOG_VERSION || typeof metadata.id !== 'string' ||
        metadata.id.toLowerCase() !== match[2].toLowerCase() || typeof metadata.taskId !== 'string' ||
        !metadata.taskId || typeof metadata.triggeredAt !== 'string' || !Number.isFinite(dateValue(metadata.triggeredAt))) {
      throw new Error('Unknown scheduler metadata format');
    }
    for (const field of ['taskName', 'error', 'logPersistenceError', 'cron', 'timezone', 'runId', 'stopRequestedAt']) {
      if (metadata[field] != null && typeof metadata[field] !== 'string') throw new Error('Invalid scheduler metadata field');
    }
    if (!ACTIVE_STATUSES.has(metadata.status) && !TERMINAL_STATUSES.has(metadata.status)) throw new Error('Unknown scheduler status');
    if (metadata.environment !== undefined && !['local', 'production', 'unknown'].includes(metadata.environment)) throw new Error('Unknown scheduler environment');
    if (metadata.params !== undefined && (!metadata.params || typeof metadata.params !== 'object' || Array.isArray(metadata.params))) throw new Error('Invalid scheduler parameters');
    if (metadata.durationMs != null && (!Number.isFinite(metadata.durationMs) || metadata.durationMs < 0)) throw new Error('Invalid scheduler duration');
    if (metadata.exitCode != null && !Number.isSafeInteger(metadata.exitCode)) throw new Error('Invalid scheduler exit code');
    for (const field of ['startedAt', 'finishedAt']) {
      if (metadata[field] != null && (typeof metadata[field] !== 'string' || !Number.isFinite(dateValue(metadata[field])))) throw new Error('Invalid scheduler timestamp');
    }
    if (metadata.triggerType !== undefined && (typeof metadata.triggerType !== 'string' || !Object.hasOwn(TRIGGER_TYPE_LABELS, metadata.triggerType))) throw new Error('Unknown task trigger type');
    if (metadata.environment === undefined) metadata.environment = 'unknown';
    return decorateRecord(metadata);
  }

  async function readDirectoryMetadata(relativeDirectory) {
    const targetDirectory = await ensureDirectory(false, relativeDirectory);
    if (!targetDirectory) return { records: [], invalidRecords: 0 };
    let entries;
    try {
      entries = await fs.readdir(targetDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { records: [], invalidRecords: 0 };
      throw error;
    }
    const candidates = entries.filter(entry => METADATA_FILENAME.test(entry.name));
    const records = [];
    let invalidRecords = 0;
    // Bound concurrent opens while querying the execution archive.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, async () => {
      while (next < candidates.length) {
        const entry = candidates[next++];
        try {
          records.push(await readMetadata(targetDirectory, entry.name));
        } catch (error) {
          // A cleanup may remove a completed record during this read.
          if (error.code !== 'ENOENT') invalidRecords += 1;
        }
      }
    }));
    return { records, invalidRecords };
  }

  async function readAllMetadata() {
    const byId = new Map();
    let invalidRecords = 0;
    for (const relativeDirectory of relativeDirectories) {
      const result = await readDirectoryMetadata(relativeDirectory);
      invalidRecords += result.invalidRecords;
      for (const record of result.records) {
        const id = record.id.toLowerCase();
        if (!byId.has(id)) byId.set(id, record);
      }
    }
    return { records: [...byId.values()], invalidRecords };
  }

  async function locateRecord(id) {
    if (typeof id !== 'string' || !RECORD_ID.test(id)) throw queryError('日志记录 ID 无效。');
    for (const relativeDirectory of relativeDirectories) {
      const targetDirectory = await ensureDirectory(false, relativeDirectory);
      if (!targetDirectory) continue;
      let entries;
      try {
        entries = await fs.readdir(targetDirectory);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const filenames = entries.filter(name => {
        const match = METADATA_FILENAME.exec(name);
        return match && match[2].toLowerCase() === id.toLowerCase();
      }).sort().reverse();
      for (const filename of filenames) {
        try {
          return { record: await readMetadata(targetDirectory, filename), targetDirectory, filename };
        } catch (error) {
          if (error.code === 'EACCES' || error.code === 'EPERM') throw queryError('没有读取任务日志的权限。', 503);
        }
      }
    }
    throw queryError('日志记录不存在、已损坏或已被清理。', 404);
  }

  async function listRecords(filters = {}) {
    const { records, invalidRecords } = await readAllMetadata();
    const options = (values, labels = {}) => [...new Set(values.filter(value => typeof value === 'string' && value))]
      .sort().map(value => ({ value, label: Object.hasOwn(labels, value) ? labels[value] : value }));
    const tasks = new Map(records.map(record => [record.taskId, record.taskName || record.taskId]));
    const facets = {
      categories: options(records.map(record => record.category), CATEGORY_LABELS),
      tasks: [...tasks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([value, label]) => ({ value, label })),
      countries: options(records.flatMap(record => record.countries), COUNTRY_LABELS),
      environments: options(records.map(record => record.environment), ENVIRONMENT_LABELS),
      statuses: options(records.map(record => record.status), STATUS_LABELS),
      triggerTypes: options(records.map(record => record.triggerType), TRIGGER_TYPE_LABELS),
    };
    const keyword = String(filters.keyword || '').toLowerCase();
    const runId = String(filters.runId || '').toLowerCase();
    const from = filters.from ? dateValue(filters.from) : -Infinity;
    const to = filters.to ? dateValue(filters.to) : Infinity;
    const matched = records.filter(record => {
      if (filters.category && record.category !== filters.category) return false;
      if (filters.taskId && record.taskId !== filters.taskId) return false;
      if (filters.status && record.status !== filters.status) return false;
      if (filters.environment && record.environment !== filters.environment) return false;
      if (filters.triggerType && record.triggerType !== filters.triggerType) return false;
      if (filters.country && !record.countries.includes(filters.country)) return false;
      if (runId && !String(record.runId || '').toLowerCase().includes(runId)) return false;
      const triggered = dateValue(record.triggeredAt);
      if (triggered < from || triggered >= to) return false;
      return !keyword || [record.taskId, record.taskName, record.id, record.runId, record.error, record.logPersistenceError, JSON.stringify(record.params || {})]
        .some(value => String(value || '').toLowerCase().includes(keyword));
    }).sort((left, right) => dateValue(right.triggeredAt) - dateValue(left.triggeredAt) || left.id.localeCompare(right.id));
    const page = Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1;
    const pageSize = Number.isSafeInteger(filters.pageSize) && filters.pageSize > 0 && filters.pageSize <= 100 ? filters.pageSize : 20;
    return {
      items: matched.slice((page - 1) * pageSize, page * pageSize), total: matched.length, page, pageSize,
      facets, invalidRecords, timezone: 'Asia/Shanghai', logDirectory: LOG_RELATIVE_DIRECTORY,
      ...(directory === undefined ? { legacyLogDirectory: LEGACY_LOG_RELATIVE_DIRECTORY } : {}),
    };
  }

  async function getRecord(id) {
    return (await locateRecord(id)).record;
  }

  async function readOutput(id, { cursor = '', limit = 200, stream = 'all', keyword = '' } = {}) {
    const position = decodeCursor(cursor);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw queryError('单次输出条数必须是 1 到 200 之间的整数。');
    if (!['all', 'stdout', 'stderr'].includes(stream)) throw queryError('输出类型无效。');
    const { targetDirectory, filename } = await locateRecord(id);
    const outputPath = path.join(targetDirectory, `${filename}l`);
    let handle;
    try {
      const identity = await safeFile(outputPath);
      handle = await fs.open(outputPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || !sameFile(opened, identity)) throw securityError('Scheduler output changed while opening');
    } catch (error) {
      if (handle) await handle.close();
      if (error.code === 'EACCES' || error.code === 'EPERM') throw queryError('没有读取任务日志输出的权限。', 503);
      throw queryError('日志输出不存在或已被清理。', 404);
    }
    try {
      const snapshotSize = (await handle.stat()).size;
      if (position.offset > snapshotSize) throw queryError('日志分页位置已失效，请重新加载。');
      let offset = position.offset;
      let textOffset = position.textOffset;
      let scannedBytes = 0;
      let textBytes = 0;
      const items = [];
      const needle = String(keyword || '').toLowerCase();
      let incompleteLine = false;
      let buffered = Buffer.alloc(0);
      while (offset < snapshotSize && items.length < limit && scannedBytes < OUTPUT_SCAN_BUDGET && textBytes < OUTPUT_TEXT_BUDGET) {
        const lineStart = offset;
        const chunks = [];
        let readPosition = offset;
        let complete = false;
        // Finish a physical line even if it crosses the scan budget. Child-process
        // chunks are normally <=64 KiB; an unusually large valid event stays readable.
        while (readPosition < snapshotSize) {
          let bytes = buffered;
          if (!bytes.length) {
            const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, snapshotSize - readPosition));
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, readPosition);
            if (!bytesRead) break;
            bytes = buffer.subarray(0, bytesRead);
          }
          const newline = bytes.indexOf(10);
          if (newline !== -1) {
            chunks.push(bytes.subarray(0, newline));
            readPosition += newline + 1;
            buffered = bytes.subarray(newline + 1);
            complete = true;
            break;
          }
          chunks.push(bytes);
          readPosition += bytes.length;
          buffered = Buffer.alloc(0);
        }
        scannedBytes += readPosition - lineStart;
        if (!complete) {
          // append() may currently be writing this last event; retry it on refresh.
          incompleteLine = true;
          break;
        }
        let event;
        try {
          event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch (_) {
          offset = readPosition;
          textOffset = 0;
          continue;
        }
        if (!event || typeof event.text !== 'string' || typeof event.stream !== 'string' ||
            (stream !== 'all' && event.stream !== stream) || (needle && !event.text.toLowerCase().includes(needle))) {
          offset = readPosition;
          textOffset = 0;
          continue;
        }
        if (textOffset > event.text.length) throw queryError('日志分页位置已失效，请重新加载。');
        const text = textSegment(event.text, textOffset, OUTPUT_TEXT_BUDGET - textBytes);
        if (!text && textOffset < event.text.length) break;
        items.push({ at: typeof event.at === 'string' ? event.at : null, stream: event.stream, text });
        textBytes += Buffer.byteLength(text, 'utf8');
        textOffset += text.length;
        if (textOffset < event.text.length) break;
        offset = readPosition;
        textOffset = 0;
      }
      const hasMore = !incompleteLine && offset < snapshotSize;
      return { items, nextCursor: hasMore || incompleteLine ? encodeCursor(offset, textOffset) : null, hasMore, scannedBytes };
    } finally {
      await handle.close();
    }
  }

  async function cleanupDirectory({ retentionDays, now }, relativeDirectory) {
    if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650) {
      throw new RangeError('retentionDays must be an integer from 0 to 3650');
    }
    const nowTime = dateValue(now);
    if (!Number.isFinite(nowTime)) throw new TypeError('now must be a valid date');
    const result = {
      directory: (await location(relativeDirectory)).directory,
      retentionDays,
      deletedRuns: 0,
      deletedFiles: 0,
      retainedRuns: 0,
      skippedActive: 0,
      skippedUnknown: 0,
    };
    const targetDirectory = await ensureDirectory(false, relativeDirectory);
    if (!targetDirectory) return result;
    const entries = await fs.readdir(targetDirectory, { withFileTypes: true });
    const names = new Set(entries.map(entry => entry.name));
    const cutoff = nowTime - retentionDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      const match = METADATA_FILENAME.exec(entry.name);
      if (!match) {
        if (!entry.name.endsWith('.jsonl') || !METADATA_FILENAME.test(entry.name.slice(0, -1)) || !names.has(entry.name.slice(0, -1))) {
          result.skippedUnknown += 1;
        }
        continue;
      }
      const metadataPath = path.join(targetDirectory, entry.name);
      const outputPath = `${metadataPath}l`;
      let metadata;
      let metadataIdentity;
      let outputIdentity;
      try {
        metadataIdentity = await safeFile(metadataPath);
        const handle = await fs.open(metadataPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if (!sameFile(await handle.stat(), metadataIdentity)) throw securityError('Scheduler metadata changed while reading');
          metadata = JSON.parse(await handle.readFile('utf8'));
        } finally {
          await handle.close();
        }
        if (!metadata || metadata.id !== match[2] || metadata.schedulerLogVersion !== LOG_VERSION) throw new Error('Unknown metadata format');
        if (ACTIVE_STATUSES.has(metadata.status)) {
          result.skippedActive += 1;
          continue;
        }
        if (!TERMINAL_STATUSES.has(metadata.status)) throw new Error('Unknown task status');
        const finishedTime = Number.isFinite(dateValue(metadata.finishedAt)) ? dateValue(metadata.finishedAt) : dateValue(metadata.triggeredAt);
        if (!Number.isFinite(finishedTime)) throw new Error('Missing execution timestamp');
        if (retentionDays !== 0 && finishedTime > cutoff) {
          result.retainedRuns += 1;
          continue;
        }
        outputIdentity = await safeFile(outputPath);
      } catch (error) {
        result.skippedUnknown += 1;
        continue;
      }
      await ensureDirectory(false, relativeDirectory);
      try {
        await safeFile(metadataPath, metadataIdentity);
        await safeFile(outputPath, outputIdentity);
      } catch (error) {
        result.skippedUnknown += 1;
        continue;
      }
      await fs.unlink(outputPath);
      result.deletedFiles += 1;
      await fs.unlink(metadataPath);
      result.deletedFiles += 1;
      result.deletedRuns += 1;
    }
    if (result.deletedFiles) await syncDirectory(targetDirectory);
    return result;
  }

  async function cleanupLogs({ retentionDays = 30, now = new Date() } = {}) {
    const results = [];
    for (const relativeDirectory of relativeDirectories) {
      results.push(await cleanupDirectory({ retentionDays, now }, relativeDirectory));
    }
    const result = { ...results[0], directories: results.map(value => value.directory) };
    for (const item of results.slice(1)) {
      for (const field of ['deletedRuns', 'deletedFiles', 'retainedRuns', 'skippedActive', 'skippedUnknown']) result[field] += item[field];
    }
    return result;
  }

  return { createRecord, cleanupLogs, listRecords, getRecord, readOutput };
}

const taskLogs = createTaskLogStore();

module.exports = { LOG_RELATIVE_DIRECTORY, LEGACY_LOG_RELATIVE_DIRECTORY, taskLogs, createTaskLogStore };
