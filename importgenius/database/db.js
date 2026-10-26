const mysql = require('mysql2/promise');
const configuration = require('../../config/environment');

let pool;
let poolEnvironment;

function loadEnv() {
  return configuration.loadDataSourceConfig('importgenius');
}

// Keep older callers compatible without injecting file values into process.env.
const loadLocalEnv = loadEnv;

function getDatabaseSettings() {
  return configuration.getDatabaseSettings('importgenius');
}

function getPool() {
  const environment = configuration.getTaskEnvironment();
  if (pool) {
    if (poolEnvironment !== environment) throw new Error('TASK_ENV must not change while a database pool is open; close the pool or restart the service.');
    return pool;
  }
  pool = mysql.createPool({
    ...getDatabaseSettings(),
    waitForConnections: true,
    connectionLimit: Math.max(2, Number(configuration.getDataSourceOption('importgenius', 'IMPORTGENIUS_DB_CONNECTION_LIMIT', 10))),
    maxIdle: 5,
    idleTimeout: 60000,
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: true,
  });
  poolEnvironment = environment;
  return pool;
}

async function hasEquivalentIndex(connection, columns, type = 'BTREE', table = 'importgenius') {
  const [rows] = await connection.execute(
    `SELECT INDEX_NAME, INDEX_TYPE, COLUMN_NAME, SEQ_IN_INDEX
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [table]
  );
  const indexes = new Map();
  for (const row of rows) {
    const index = indexes.get(row.INDEX_NAME) || { type: row.INDEX_TYPE, columns: [] };
    index.columns.push(row.COLUMN_NAME);
    indexes.set(row.INDEX_NAME, index);
  }
  return [...indexes.values()].some(index => index.type === type &&
    (type === 'FULLTEXT' ? index.columns.length === columns.length : index.columns.length >= columns.length) &&
    columns.every((column, position) => index.columns[position] === column));
}

function extractProductDescription(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch (_) { return ''; }
  }
  const shipments = Array.isArray(value?.shipments) ? value.shipments : [];
  const descriptions = [];
  for (const shipment of shipments) {
    const description = shipment?.ProductDescription;
    const parts = Array.isArray(description) ? description : [description];
    for (const part of parts) {
      if (typeof part === 'string' || typeof part === 'number') {
        const text = String(part).trim();
        if (text) descriptions.push(text);
      }
    }
  }
  // Keep each indexed document below MEDIUMTEXT's 16 MiB limit and bound batch memory.
  return descriptions.join('\n').slice(0, 1_000_000);
}

async function ensureSearchTableAndIndex(connection, idColumnType) {
  if (!/^(tinyint|smallint|mediumint|int|integer|bigint)(\(\d+\))?( unsigned)?$/i.test(idColumnType || '')) {
    throw new Error(`Unsupported importgenius.id column type for search side table: ${idColumnType || 'missing'}`);
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS importgenius_search (
    importgenius_id ${idColumnType} NOT NULL,
    FTS_DOC_ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_description MEDIUMTEXT NOT NULL,
    PRIMARY KEY (importgenius_id),
    UNIQUE KEY FTS_DOC_ID_INDEX (FTS_DOC_ID)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS importgenius_search_backfill (
    singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    high_water_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('pending', 'backfilling', 'complete') NOT NULL DEFAULT 'pending',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await connection.query("INSERT IGNORE INTO importgenius_search_backfill (singleton_id) VALUES (1)");

  const [[state]] = await connection.query('SELECT high_water_id, last_id, status FROM importgenius_search_backfill WHERE singleton_id = 1');
  if (state.status === 'pending') {
    const [[{ highWaterId }]] = await connection.query('SELECT COALESCE(MAX(id), 0) AS highWaterId FROM importgenius');
    await connection.execute(
      "UPDATE importgenius_search_backfill SET high_water_id = ?, last_id = 0, status = 'backfilling' WHERE singleton_id = 1",
      [String(highWaterId)]
    );
    state.high_water_id = highWaterId;
    state.last_id = 0;
    state.status = 'backfilling';
  }

  let scanned = 0;
  let lastId = String(state.last_id || 0);
  const highWaterId = String(state.high_water_id || 0);
  while (state.status === 'backfilling') {
    const [rows] = await connection.execute(
      'SELECT id, raw FROM importgenius WHERE id > ? AND id <= ? ORDER BY id ASC LIMIT 100',
      [lastId, highWaterId]
    );
    if (!rows.length) {
      await connection.execute("UPDATE importgenius_search_backfill SET status = 'complete' WHERE singleton_id = 1");
      state.status = 'complete';
      break;
    }
    const searchRows = rows.map(row => [String(row.id), extractProductDescription(row.raw)]).filter(([, text]) => text);
    await connection.beginTransaction();
    try {
      for (let start = 0; start < searchRows.length; start += 25) {
        const chunk = searchRows.slice(start, start + 25);
        await connection.execute(
          `INSERT INTO importgenius_search (importgenius_id, product_description)
           VALUES ${chunk.map(() => '(?, ?)').join(',')}
           ON DUPLICATE KEY UPDATE product_description = VALUES(product_description)`,
          chunk.flat()
        );
      }
      lastId = String(rows[rows.length - 1].id);
      await connection.execute(
        'UPDATE importgenius_search_backfill SET last_id = ? WHERE singleton_id = 1',
        [lastId]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    scanned += rows.length;
    if (scanned && scanned % 50000 === 0) console.log(`[ImportGenius] search sidecar backfill scanned ${scanned} rows; last id ${lastId}`);
  }

  if (await hasEquivalentIndex(connection, ['product_description'], 'FULLTEXT', 'importgenius_search')) {
    return { index: 'ft_ig_product_description', status: 'already-covered', backfillStatus: state.status, scannedRows: scanned };
  }
  await connection.query(
    'ALTER TABLE importgenius_search ADD FULLTEXT INDEX ft_ig_product_description (product_description), ALGORITHM=INPLACE, LOCK=SHARED'
  );
  return { index: 'ft_ig_product_description', status: 'created', backfillStatus: state.status, scannedRows: scanned };
}

async function ensurePerformanceIndexes() {
  const connection = await getPool().getConnection();
  const results = [];
  try {
    const [tableRows] = await connection.execute(
      "SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'importgenius' LIMIT 1"
    );
    if (!tableRows.length) throw new Error('ImportGenius table importgenius does not exist.');
    let [columnRows] = await connection.execute(
      "SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, COLUMN_TYPE AS column_type, COLUMN_DEFAULT AS column_default, EXTRA AS extra FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'importgenius'"
    );
    let columns = new Map(columnRows.map(row => [row.column_name.toLowerCase(), row]));
    if (!columns.has('createdat')) {
      await connection.query('ALTER TABLE importgenius ADD COLUMN createdAt DATETIME NULL DEFAULT NULL, ALGORITHM=INPLACE, LOCK=NONE');
      await connection.query('ALTER TABLE importgenius ALTER COLUMN createdAt SET DEFAULT CURRENT_TIMESTAMP, ALGORITHM=INPLACE, LOCK=NONE');
      results.push({ index: 'createdAt', status: 'created' });
      [columnRows] = await connection.execute(
        "SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, COLUMN_TYPE AS column_type, COLUMN_DEFAULT AS column_default, EXTRA AS extra FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'importgenius'"
      );
      columns = new Map(columnRows.map(row => [row.column_name.toLowerCase(), row]));
    } else if (String(columns.get('createdat').column_default || '').toUpperCase() !== 'CURRENT_TIMESTAMP') {
      await connection.query('ALTER TABLE importgenius ALTER COLUMN createdAt SET DEFAULT CURRENT_TIMESTAMP, ALGORITHM=INPLACE, LOCK=NONE');
      results.push({ index: 'createdAt', status: 'default-updated' });
    }
    const definitions = [
      { name: 'idx_ig_url', columns: ['url'], sql: 'ADD INDEX idx_ig_url (url(191))' },
      { name: 'idx_ig_date_id', columns: ['mostRecentDate', 'id'], sql: 'ADD INDEX idx_ig_date_id (mostRecentDate, id)' },
      { name: 'idx_ig_country_created_id', columns: ['country', 'createdAt', 'id'], sql: 'ADD INDEX idx_ig_country_created_id (country, createdAt, id)' },
      { name: 'idx_ig_country_date_id', columns: ['country', 'mostRecentDate', 'id'], sql: 'ADD INDEX idx_ig_country_date_id (country, mostRecentDate, id)' },
      { name: 'idx_ig_country_target_date_id', columns: ['country', 'isTarget', 'mostRecentDate', 'id'], sql: 'ADD INDEX idx_ig_country_target_date_id (country, isTarget, mostRecentDate, id)' },
    ];
    for (const definition of definitions) {
      if (!definition.columns.every(column => columns.has(column.toLowerCase()))) {
        results.push({ index: definition.name, status: 'required-column-missing' });
        continue;
      }
      if (await hasEquivalentIndex(connection, definition.columns)) {
        results.push({ index: definition.name, status: 'already-covered' });
        continue;
      }
      const sql = definition.name === 'idx_ig_url' && columns.get('url').data_type !== 'text' &&
        !['tinytext', 'mediumtext', 'longtext'].includes(columns.get('url').data_type)
        ? 'ADD INDEX idx_ig_url (url)'
        : definition.sql;
      await connection.query(`ALTER TABLE importgenius ${sql}, ALGORITHM=INPLACE, LOCK=NONE`);
      results.push({ index: definition.name, status: 'created' });
    }

    results.push(await ensureSearchTableAndIndex(connection, columns.get('id')?.column_type));
    return results;
  } finally {
    connection.release();
  }
}

async function hasFullTextIndex() {
  const [rows] = await getPool().execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'importgenius_search'
       AND INDEX_TYPE = 'FULLTEXT' AND COLUMN_NAME = 'product_description' LIMIT 1`
  );
  return rows.length > 0;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  poolEnvironment = undefined;
  await current.end();
}

module.exports = { getPool, getDatabaseSettings, ensurePerformanceIndexes, hasFullTextIndex, extractProductDescription, closePool, loadEnv, loadLocalEnv };
