const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DATA_ROOT = path.resolve(__dirname, '../data/importer');
const STAGES = ['list', 'details', 'import'];
const STATUSES = new Set(['pending', 'running', 'success', 'failed']);
const queues = new Map();

function problem(message, status = 400, cause) {
  return Object.assign(new Error(message), { status, ...(cause ? { cause } : {}) });
}

function countryName(value) {
  const country = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z]+$/.test(country)) throw problem('国家目录无效。');
  return country;
}

function environmentName(value = process.env.TASK_ENV || 'unknown') {
  if (!['local', 'production', 'unknown'].includes(value)) throw problem('采集批次环境无效。');
  return value;
}

function pageNumbers(value, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) ||
      value.some(page => !Number.isSafeInteger(page) || page < 1 || page > 10000)) {
    throw problem('批次页码必须为 1 到 10000 的正整数数组。');
  }
  return [...new Set(value)].sort((a, b) => a - b);
}

function createBatchId(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw problem('批次创建时间无效。');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}/${parts.hour}${parts.minute}${parts.second}-${crypto.randomBytes(4).toString('hex')}`;
}

function validateBatchId(value) {
  if (value === 'legacy') return value;
  if (typeof value !== 'string' || !/^\d{8}\/\d{6}-[0-9a-f]{8}$/.test(value)) {
    throw problem('采集批次格式无效，应为 YYYYMMDD/HHmmss-8位标识或 legacy。');
  }
  const [date, time] = value.split('/');
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== iso) throw problem('采集批次日期或时间无效。');
  return value;
}

async function rootDirectory(dataRoot, create = false) {
  const directory = path.resolve(dataRoot || DEFAULT_DATA_ROOT);
  if (create) await fs.mkdir(directory, { recursive: true });
  let stat;
  try { stat = await fs.lstat(directory); } catch (error) {
    if (error.code === 'ENOENT') throw problem('采集数据目录不存在。', 404);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw problem('采集数据目录不能是符号链接或普通文件。');
  return fs.realpath(directory);
}

async function childDirectory(root, segments, create = false) {
  let directory = root;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    if (create) {
      try { await fs.mkdir(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    let stat;
    try { stat = await fs.lstat(directory); } catch (error) {
      if (error.code === 'ENOENT') throw problem('采集批次不存在。', 404);
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw problem('采集批次目录不能包含符号链接或普通文件。');
  }
  return directory;
}

function checkedContext(context) {
  if (!context || typeof context !== 'object') throw problem('采集批次上下文无效。');
  const country = countryName(context.country);
  const batchId = validateBatchId(context.batchId);
  const root = path.resolve(context.dataRoot || DEFAULT_DATA_ROOT);
  const segments = [country, ...(batchId === 'legacy' ? [] : batchId.split('/'))];
  const expected = path.join(root, ...segments);
  if (path.resolve(context.directory || '') !== expected) throw problem('采集批次路径无效。');
  let current = root;
  for (const segment of [null, ...segments]) {
    if (segment !== null) current = path.join(current, segment);
    let stat;
    try { stat = fsSync.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') throw problem('采集批次不存在。', 404);
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw problem('采集批次路径不能包含符号链接。');
  }
  return expected;
}

function pagePath(context, page) {
  const directory = checkedContext(context);
  pageNumbers([page]);
  if (!context.pages?.includes(page) || !context.manifest?.pages?.includes(page)) throw problem('请求页码不属于选定采集批次。');
  const target = path.join(directory, `${page}.json`);
  try {
    const stat = fsSync.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw problem('采集页文件不能是符号链接或目录。');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return target;
}

async function readManifest(directory) {
  const target = path.join(directory, 'manifest.json');
  let handle;
  try {
    handle = await fs.open(target, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) throw problem('批次清单必须是普通文件。');
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw problem('采集批次清单不存在。', 404);
    if (error.code === 'ELOOP') throw problem('批次清单不能是符号链接。');
    if (error instanceof SyntaxError) throw problem('采集批次清单 JSON 损坏。', 422, error);
    throw error;
  } finally { await handle?.close(); }
}

function validateManifest(manifest, country, batchId) {
  try {
    if (!manifest || manifest.schemaVersion !== 1 || manifest.batchId !== batchId || manifest.country !== country ||
        typeof manifest.source !== 'string' || !manifest.source ||
        !['local', 'production', 'unknown'].includes(manifest.environment) ||
        typeof manifest.createdAt !== 'string' || typeof manifest.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(manifest.createdAt)) || !Number.isFinite(Date.parse(manifest.updatedAt))) throw new Error('基本信息无效');
    environmentName(manifest.environment);
    const pages = pageNumbers(manifest.pages);
    if (JSON.stringify(pages) !== JSON.stringify(manifest.pages)) throw new Error('页码重复或未排序');
    for (const page of pages) {
      for (const stage of STAGES) {
        if (!STATUSES.has(manifest.pageStates?.[page]?.[stage]?.status)) throw new Error(`第 ${page} 页阶段信息无效`);
      }
    }
    return manifest;
  } catch (error) { throw problem(`采集批次清单损坏：${error.message}。`, 422, error); }
}

function initialPageStates(pages, legacy = false) {
  return Object.fromEntries(pages.map(page => [page, Object.fromEntries(STAGES.map(stage =>
    [stage, { status: legacy && stage === 'list' ? 'success' : 'pending' }]))]));
}

function withQueue(key, operation) {
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, next);
  return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}

async function createBatch(countryValue, pagesValue, options = {}) {
  const country = countryName(countryValue);
  const pages = pageNumbers(pagesValue);
  const batchId = validateBatchId(options.batchId === undefined ? createBatchId() : options.batchId);
  if (batchId === 'legacy') throw problem('不能创建 legacy 采集批次。');
  const environment = environmentName(options.environment);
  const source = options.source || 'manual';
  if (typeof source !== 'string' || !source.trim() || source.length > 200) throw problem('采集批次来源无效。');
  const dataRoot = await rootDirectory(options.dataRoot, true);
  const [date, name] = batchId.split('/');
  const parentDirectory = await childDirectory(dataRoot, [country, date], true);
  const directory = path.join(parentDirectory, name);
  try { await fs.mkdir(directory); } catch (error) {
    if (error.code === 'EEXIST') throw problem('采集批次目录已存在，请续跑该批次或创建新批次。', 409);
    throw error;
  }
  const now = new Date().toISOString();
  const manifest = { schemaVersion: 1, batchId, country, environment, source, createdAt: now, updatedAt: now, pages: [...pages], pageStates: initialPageStates(pages) };
  const target = path.join(directory, 'manifest.json');
  const temporary = path.join(directory, `.manifest-create-${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    try { if ((await fs.lstat(target)).isSymbolicLink()) throw problem('批次清单不能是符号链接。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    handle = await fs.open(temporary, fsSync.constants.O_WRONLY | fsSync.constants.O_CREAT | fsSync.constants.O_EXCL | fsSync.constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`);
    await handle.sync();
    await handle.close(); handle = null;
    await childDirectory(dataRoot, [country, ...batchId.split('/')]);
    // A hard link publishes the complete manifest atomically and never replaces another creator's file.
    await fs.link(temporary, target);
  } catch (error) {
    if (error.code === 'EEXIST') throw problem('采集批次已存在，请续跑该批次或创建新批次。', 409);
    throw error;
  } finally { await handle?.close(); await fs.rm(temporary, { force: true }).catch(() => {}); }
  return { batchId, country, pages, directory, legacy: false, manifest, dataRoot };
}

async function legacyPages(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    if (!/^[1-9]\d*\.json$/.test(entry.name)) continue;
    if (entry.isSymbolicLink()) throw problem('历史采集页不能是符号链接。');
    if (entry.isFile()) pages.push(Number.parseInt(entry.name, 10));
  }
  return pageNumbers(pages, true);
}

async function openBatch(countryValue, batchIdValue, options = {}) {
  const country = countryName(countryValue);
  const batchId = validateBatchId(batchIdValue);
  const environment = environmentName(options.environment);
  const dataRoot = await rootDirectory(options.dataRoot);
  const directory = await childDirectory(dataRoot, [country, ...(batchId === 'legacy' ? [] : batchId.split('/'))]);
  const legacy = batchId === 'legacy';
  let manifest;
  if (legacy) {
    const pages = await legacyPages(directory);
    if (!pages.length) throw problem('没有可用的历史采集 JSON。', 404);
    manifest = { schemaVersion: 1, batchId, country, environment: 'unknown', source: 'legacy', createdAt: null, updatedAt: null, pages, pageStates: initialPageStates(pages, true) };
  } else {
    manifest = validateManifest(await readManifest(directory), country, batchId);
    if (manifest.environment !== environment) throw problem(`采集批次属于 ${manifest.environment} 环境，当前为 ${environment} 环境。`, 409);
  }
  const pages = options.pages === undefined ? [...manifest.pages] : pageNumbers(options.pages);
  if (pages.some(page => !manifest.pages.includes(page))) throw problem('请求页码不属于原采集批次。', legacy ? 404 : 400);
  return { batchId, country, pages, directory, legacy, manifest, dataRoot };
}

async function atomicManifest(context, manifest) {
  const directory = checkedContext(context);
  const target = path.join(directory, 'manifest.json');
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw problem('批次清单不能是符号链接或目录。');
  const temporary = path.join(directory, `.manifest-${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, fsSync.constants.O_WRONLY | fsSync.constants.O_CREAT | fsSync.constants.O_EXCL | fsSync.constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`);
    await handle.sync();
    await handle.close(); handle = null;
    checkedContext(context);
    await fs.rename(temporary, target);
  } finally { await handle?.close(); await fs.rm(temporary, { force: true }).catch(() => {}); }
}

async function setPageStage(context, page, stage, status, details = {}) {
  pagePath(context, page);
  if (!STAGES.includes(stage) || !STATUSES.has(status)) throw problem('采集阶段或状态无效。');
  if (!details || typeof details !== 'object' || Array.isArray(details)) throw problem('采集阶段详情无效。');
  if (details.count !== undefined && (!Number.isSafeInteger(details.count) || details.count < 0)) throw problem('采集阶段数量无效。');
  if (details.capturedAt !== undefined && (typeof details.capturedAt !== 'string' || !Number.isFinite(Date.parse(details.capturedAt)))) throw problem('列表采集时间无效。');
  return withQueue(path.join(context.directory, 'manifest.json'), async () => {
    checkedContext(context);
    const manifest = context.legacy ? JSON.parse(JSON.stringify(context.manifest))
      : validateManifest(await readManifest(context.directory), context.country, context.batchId);
    if (!context.legacy && manifest.environment !== context.manifest.environment) throw problem('采集批次环境发生变化。', 409);
    if (!manifest.pages.includes(page)) throw problem('请求页码不属于原采集批次。');
    const previous = manifest.pageStates[page][stage];
    const now = new Date().toISOString();
    const state = { ...previous, ...details, status, updatedAt: now };
    if (status !== 'pending') state.startedAt = status === 'running' ? now : (previous.startedAt || now);
    else delete state.startedAt;
    if (status === 'success' || status === 'failed') state.finishedAt = now;
    else delete state.finishedAt;
    if (status === 'failed' && details.error !== undefined) state.error = String(details.error?.message || details.error);
    else if (status !== 'failed') delete state.error;
    manifest.pageStates[page][stage] = state;
    manifest.updatedAt = now;
    if (!context.legacy) await atomicManifest(context, manifest);
    context.manifest = manifest;
    return state;
  });
}

function summary(manifest, legacy = false) {
  return {
    batchId: manifest.batchId, country: manifest.country, createdAt: manifest.createdAt, updatedAt: manifest.updatedAt,
    environment: manifest.environment, source: manifest.source, legacy, pages: [...manifest.pages], totalPages: manifest.pages.length,
    progress: Object.fromEntries(STAGES.map(stage => [stage, legacy && stage !== 'list' ? null
      : manifest.pages.filter(page => manifest.pageStates[page][stage].status === 'success').length])),
  };
}

async function listBatches(countryValue, options = {}) {
  const country = countryName(countryValue);
  const environment = environmentName(options.environment);
  let dataRoot;
  let directory;
  try {
    dataRoot = await rootDirectory(options.dataRoot);
    directory = await childDirectory(dataRoot, [country]);
  } catch (error) { if (error.status === 404) return []; throw error; }
  const batches = [];
  const diagnose = (batchId, error) => console.warn(`[ImportGenius][批次] 跳过 ${country}/${batchId}：${error.message}`);
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!/^\d{8}$/.test(entry.name)) continue;
    try {
      const dateDirectory = await childDirectory(directory, [entry.name]);
      for (const batch of await fs.readdir(dateDirectory, { withFileTypes: true })) {
        const batchId = `${entry.name}/${batch.name}`;
        if (!/^\d{6}-[0-9a-f]{8}$/.test(batch.name)) continue;
        try {
          validateBatchId(batchId);
          const context = await openBatch(country, batchId, { dataRoot, environment });
          batches.push(summary(context.manifest));
        } catch (error) { if (error.status !== 409) diagnose(batchId, error); }
      }
    } catch (error) { diagnose(entry.name, error); }
  }
  try {
    const context = await openBatch(country, 'legacy', { dataRoot, environment });
    batches.push(summary(context.manifest, true));
  } catch (error) { if (error.status !== 404) diagnose('legacy', error); }
  return batches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.batchId.localeCompare(a.batchId));
}

module.exports = { createBatchId, validateBatchId, createBatch, openBatch, pagePath, setPageStage, listBatches };
