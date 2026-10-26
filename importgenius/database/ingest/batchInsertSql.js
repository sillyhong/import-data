const fs = require('fs/promises');
const path = require('path');
const database = require('../db');
const { openBatch, pagePath, setPageStage } = require('../../storage/batches');

const SELECT_CHUNK_SIZE = 300;
const INSERT_CHUNK_SIZE = 25;
const UPDATE_CHUNK_SIZE = 40;

function parseExistingRaw(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch (_) {
    return {};
  }
}

function shipmentKey(shipment) {
  const bill = String(shipment?.BillOfLading || '').trim();
  if (bill) return `bol:${bill}`;
  return `raw:${JSON.stringify(shipment || {})}`;
}

function mergeShipmentRaw(item, existingRaw) {
  const existingShipments = Array.isArray(existingRaw.shipments) ? existingRaw.shipments : [];
  const existingKeys = new Set(existingShipments.map(shipmentKey));
  const newShipments = [];
  for (const shipment of Array.isArray(item.shipments) ? item.shipments : []) {
    const key = shipmentKey(shipment);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    newShipments.push(shipment);
  }
  if (!newShipments.length) return null;
  return JSON.stringify({ ...item, shipments: [...newShipments, ...existingShipments] });
}

async function loadExistingRecords(connection, urls) {
  const records = new Map();
  for (let start = 0; start < urls.length; start += SELECT_CHUNK_SIZE) {
    const chunk = urls.slice(start, start + SELECT_CHUNK_SIZE);
    const [rows] = await connection.query(
      `SELECT url, raw FROM importgenius WHERE url IN (${chunk.map(() => '?').join(',')})`,
      chunk
    );
    for (const row of rows) records.set(row.url, row);
  }
  return records;
}

async function insertChunks(connection, rows) {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + INSERT_CHUNK_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    const params = chunk.flatMap(row => [row.raw, row.totalShipments, row.company, row.contactInfo, row.mostRecentDate, row.url, row.country]);
    await connection.execute(
      `INSERT INTO importgenius (raw, totalShipments, company, contactInfo, mostRecentDate, url, country) VALUES ${placeholders}`,
      params
    );
  }
}

async function updateChunks(connection, rows) {
  for (let start = 0; start < rows.length; start += UPDATE_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + UPDATE_CHUNK_SIZE);
    const assignments = ['totalShipments', 'mostRecentDate', 'raw'].map(column =>
      `${column} = CASE url ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} ELSE ${column} END`
    );
    const params = [];
    for (const column of ['totalShipments', 'mostRecentDate', 'raw']) {
      for (const row of chunk) params.push(row.url, row[column]);
    }
    params.push(...chunk.map(row => row.url));
    await connection.execute(
      `UPDATE importgenius SET ${assignments.join(', ')} WHERE url IN (${chunk.map(() => '?').join(',')})`,
      params
    );
  }
}

async function syncSearchSidecar(connection, rows) {
  const idsByUrl = new Map();
  const urls = rows.map(row => row.url);
  for (let start = 0; start < urls.length; start += SELECT_CHUNK_SIZE) {
    const chunk = urls.slice(start, start + SELECT_CHUNK_SIZE);
    const [matches] = await connection.query(
      `SELECT id, url FROM importgenius WHERE url IN (${chunk.map(() => '?').join(',')})`,
      chunk
    );
    for (const match of matches) idsByUrl.set(match.url, String(match.id));
  }
  const searchRows = [];
  const emptyIds = [];
  for (const row of rows) {
    const id = idsByUrl.get(row.url);
    if (!id) continue;
    const description = database.extractProductDescription(row.raw);
    if (description) searchRows.push([id, description]);
    else emptyIds.push(id);
  }
  for (let start = 0; start < searchRows.length; start += 100) {
    const chunk = searchRows.slice(start, start + 100);
    await connection.execute(
      `INSERT INTO importgenius_search (importgenius_id, product_description)
       VALUES ${chunk.map(() => '(?, ?)').join(',')}
       ON DUPLICATE KEY UPDATE
         FTS_DOC_ID = VALUES(FTS_DOC_ID),
         product_description = VALUES(product_description)`,
      chunk.flat()
    );
  }
  for (let start = 0; start < emptyIds.length; start += SELECT_CHUNK_SIZE) {
    const chunk = emptyIds.slice(start, start + SELECT_CHUNK_SIZE);
    await connection.execute(
      `DELETE FROM importgenius_search WHERE importgenius_id IN (${chunk.map(() => '?').join(',')})`,
      chunk
    );
  }
}

async function insertData(country, data, connection, sourceFile, searchTableAvailable = false) {
  const byUrl = new Map();
  for (const item of data) {
    if (!item?.url) continue;
    byUrl.set(item.url, item);
  }
  const records = [...byUrl.values()];
  const existing = await loadExistingRecords(connection, records.map(item => item.url));
  const inserts = [];
  const updates = [];
  const missingShipmentDetails = [];

  for (const item of records) {
    const old = existing.get(item.url);
    if (!Array.isArray(item.shipments)) {
      if (!old) missingShipmentDetails.push(item.company || item.url);
      continue;
    }

    const row = {
      raw: JSON.stringify(item),
      totalShipments: item.totalShipments ?? 0,
      company: item.company || '',
      contactInfo: item.contactInfo || null,
      mostRecentDate: item.mostRecentDate || null,
      url: item.url,
      country,
    };
    if (!old) {
      inserts.push(row);
      continue;
    }
    if (!item.shipments.length) continue;
    const mergedRaw = mergeShipmentRaw(item, parseExistingRaw(old.raw));
    if (!mergedRaw) continue;
    updates.push({ ...row, raw: mergedRaw });
  }

  if (missingShipmentDetails.length) {
    const examples = missingShipmentDetails.slice(0, 5).join('、');
    const remaining = missingShipmentDetails.length - 5;
    throw new Error(
      `拒绝导入 ${missingShipmentDetails.length} 条新记录：缺少 shipments 明细（${examples}${remaining > 0 ? `，另有 ${remaining} 条` : ''}）。请先运行 ImportGenius「补充 shipment 明细」，再重新入库。`
    );
  }

  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await insertChunks(connection, inserts);
    await updateChunks(connection, updates);
    if (searchTableAvailable && (inserts.length || updates.length)) {
      await syncSearchSidecar(connection, [...inserts, ...updates]);
    }
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback().catch(rollbackError => {
        console.error(`[ImportGenius][入库] 回滚失败：${rollbackError.message}`);
      });
    }
    throw error;
  }
  console.log(`[ImportGenius][入库] ${path.basename(sourceFile)}：新增 ${inserts.length} 条，合并 ${updates.length} 条，跳过 ${records.length - inserts.length - updates.length} 条。`);
  return { inserted: inserts.length, merged: updates.length, skipped: records.length - inserts.length - updates.length };
}

async function batchInsertSql(country, fileNumber, options = {}) {
  if (!/^[a-z]+$/i.test(String(country || ''))) throw new Error('Invalid country directory.');
  const batch = options.batch || (options.batchId
    ? await openBatch(country, options.batchId, { pages: fileNumber ? [Number(fileNumber)] : undefined, dataRoot: options.dataRoot })
    : null);
  if (batch && batch.country !== country) throw new Error('入库批次与国家不匹配。');
  const directory = batch?.directory || path.join(__dirname, `../../data/importer/${country}`);
  const files = fileNumber
    ? [`${Number(fileNumber)}.json`]
    : batch ? batch.pages.map(page => `${page}.json`)
      : (await fs.readdir(directory)).filter(file => /^\d+\.json$/.test(file)).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  const connection = await database.getPool().getConnection();
  try {
    const [[searchTable]] = await connection.execute(
      "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'importgenius_search' LIMIT 1"
    );
    for (const file of files) {
      const page = Number.parseInt(file, 10);
      const filePath = batch ? pagePath(batch, page) : path.join(directory, file);
      if (batch) await setPageStage(batch, page, 'import', 'running');
      try {
        const jsonData = JSON.parse(await fs.readFile(filePath, 'utf8'));
        if (!Array.isArray(jsonData)) throw new Error(`Expected a JSON array in ${filePath}`);
        if (batch && !batch.legacy && jsonData.some(item => item?.url && !Array.isArray(item.shipments))) {
          throw new Error(`批次 ${batch.batchId} 第 ${page} 页 shipment 明细尚未补齐，请先对同一批次执行“补充 shipment 明细”。`);
        }
        console.log(`[ImportGenius][入库] 来源 ${filePath}。`);
        const counts = await insertData(country, jsonData, connection, filePath, Boolean(searchTable));
        if (batch) await setPageStage(batch, page, 'import', 'success', { count: jsonData.length, ...counts });
      } catch (error) {
        if (batch) await setPageStage(batch, page, 'import', 'failed', { error: error.message });
        throw error;
      }
    }
  } finally {
    connection.release();
  }
}

module.exports = { batchInsertSql, insertData, mergeShipmentRaw };
