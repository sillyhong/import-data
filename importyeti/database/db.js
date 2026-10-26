const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const configuration = require('../../config/environment');

const schemaPath = path.join(__dirname, 'migrations/001_initial_schema.sql');
let pool;
let poolEnvironment;

function loadEnv() {
  return configuration.loadDataSourceConfig('importyeti');
}

// Kept as an alias for older callers; environment selection is now shared.
const loadLocalEnv = loadEnv;

function getDatabaseSettings() {
  return configuration.getDatabaseSettings('importyeti');
}

function getPool() {
  const environment = configuration.getTaskEnvironment();
  if (pool) {
    if (poolEnvironment !== environment) throw new Error('TASK_ENV must not change while a database pool is open; close the pool or restart the service.');
    return pool;
  }
  const settings = getDatabaseSettings();
  pool = mysql.createPool({
    ...settings,
    waitForConnections: true,
    connectionLimit: Math.max(2, Number(configuration.getDataSourceOption('importyeti', 'IMPORTYETI_DB_CONNECTION_LIMIT', 10))),
    maxIdle: 5,
    idleTimeout: 60000,
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: true,
    timezone: 'Z',
  });
  poolEnvironment = environment;
  return pool;
}

async function hasEquivalentIndex(connection, table, columns, indexType = 'BTREE') {
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
  return [...indexes.values()].some(index => index.type === indexType &&
    (indexType === 'FULLTEXT' ? index.columns.length === columns.length : index.columns.length >= columns.length) &&
    columns.every((column, position) => index.columns[position] === column));
}

async function ensurePerformanceIndexes(connection = getPool()) {
  const indexDefinitions = [
    { table: 'iy_crawl_targets', name: 'idx_iy_target_queue_claim', columns: ['status', 'depth', 'id', 'next_attempt_at'], sql: 'ADD INDEX idx_iy_target_queue_claim (status, depth, id, next_attempt_at)' },
    { table: 'iy_crawl_targets', name: 'idx_iy_target_stale', columns: ['status', 'updated_at'], sql: 'ADD INDEX idx_iy_target_stale (status, updated_at)' },
    { table: 'iy_shipments', name: 'idx_iy_shipment_master_bol', columns: ['master_bol_number'], sql: 'ADD INDEX idx_iy_shipment_master_bol (master_bol_number)' },
    { table: 'iy_shipments', name: 'idx_iy_shipment_arrival_id', columns: ['arrival_date', 'id'], sql: 'ADD INDEX idx_iy_shipment_arrival_id (arrival_date, id)' },
    { table: 'iy_shipments', name: 'ft_iy_shipment_product_description', type: 'FULLTEXT', columns: ['product_description'], sql: 'ADD FULLTEXT INDEX ft_iy_shipment_product_description (product_description)' },
    { table: 'iy_entities', name: 'idx_iy_entity_sort', columns: ['entity_type', 'total_shipments', 'id'], sql: 'ADD INDEX idx_iy_entity_sort (entity_type, total_shipments, id)' },
    { table: 'iy_entities', name: 'idx_iy_entity_global_sort', columns: ['total_shipments', 'id'], sql: 'ADD INDEX idx_iy_entity_global_sort (total_shipments, id)' },
    { table: 'iy_entities', name: 'ft_iy_entity_search', type: 'FULLTEXT', columns: ['name', 'slug', 'address'], sql: 'ADD FULLTEXT INDEX ft_iy_entity_search (name, slug, address)' },
  ];
  const results = [];
  for (const definition of indexDefinitions) {
    const [tables] = await connection.execute(
      'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
      [definition.table]
    );
    if (!tables.length) {
      results.push({ table: definition.table, index: definition.name, status: 'table-missing' });
      continue;
    }
    const equivalent = await hasEquivalentIndex(connection, definition.table, definition.columns, definition.type || 'BTREE');
    if (equivalent) {
      results.push({ table: definition.table, index: definition.name, status: 'already-covered' });
      continue;
    }
    const onlineClause = definition.type === 'FULLTEXT'
      ? ', ALGORITHM=INPLACE, LOCK=SHARED'
      : ', ALGORITHM=INPLACE, LOCK=NONE';
    await connection.query(`ALTER TABLE \`${definition.table}\` ${definition.sql}${onlineClause}`);
    results.push({ table: definition.table, index: definition.name, status: 'created' });
  }
  return results;
}

async function hasPerformanceIndex(table, columns, type = 'BTREE') {
  const connection = await getPool().getConnection();
  try {
    return await hasEquivalentIndex(connection, table, columns, type);
  } finally {
    connection.release();
  }
}

async function initializeSchema() {
  const connection = await getPool().getConnection();
  try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);
    for (const statement of statements) await connection.query(statement);
    return await ensurePerformanceIndexes(connection);
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  poolEnvironment = undefined;
  await current.end();
}

module.exports = { getPool, initializeSchema, ensurePerformanceIndexes, hasPerformanceIndex, closePool, loadEnv, loadLocalEnv, getDatabaseSettings };
