const { getPool: getImportGeniusPool } = require('../../importgenius/database/db');
const { getPool: getImportYetiPool } = require('../../importyeti/database/db');

async function inspectDatabase(name, pool, tableNames, plans) {
  const [versionRows] = await pool.query('SELECT VERSION() AS mysql_version');
  const [tables] = await pool.execute(
    `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tableNames.map(() => '?').join(',')})
     ORDER BY TABLE_NAME`,
    tableNames
  );
  const [indexes] = await pool.execute(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, INDEX_TYPE
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tableNames.map(() => '?').join(',')})
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    tableNames
  );
  const existingTables = new Set(tables.map(table => table.TABLE_NAME));
  const queryPlans = [];
  for (const [label, table, sql] of plans) {
    if (!existingTables.has(table)) {
      queryPlans.push({ label, status: 'table-missing' });
      continue;
    }
    try {
      const [rows] = await pool.query(`EXPLAIN ${sql}`);
      queryPlans.push({ label, plan: rows.map(row => ({
        table: row.table,
        type: row.type,
        possibleKeys: row.possible_keys,
        key: row.key,
        rowsEstimate: row.rows,
        filteredPercent: row.filtered,
        extra: row.Extra,
      })) });
    } catch (error) {
      queryPlans.push({ label, status: 'unavailable', reason: error.message });
    }
  }
  return {
    name,
    mysqlVersion: versionRows[0].mysql_version,
    tableSizeNote: 'TABLE_ROWS 是 InnoDB 估算行数；EXPLAIN 是静态计划，不执行查询。',
    tables: tables.map(table => ({
      name: table.TABLE_NAME,
      engine: table.ENGINE,
      approximateRows: Number(table.TABLE_ROWS) || 0,
      dataBytes: Number(table.DATA_LENGTH) || 0,
      indexBytes: Number(table.INDEX_LENGTH) || 0,
    })),
    indexes: indexes.map(index => ({
      table: index.TABLE_NAME,
      name: index.INDEX_NAME,
      unique: Number(index.NON_UNIQUE) === 0,
      position: Number(index.SEQ_IN_INDEX),
      column: index.COLUMN_NAME,
      prefixLength: index.SUB_PART === null ? null : Number(index.SUB_PART),
      type: index.INDEX_TYPE,
    })),
    queryPlans,
  };
}

async function inspectDatabases() {
  const importGenius = await inspectDatabase('ImportGenius', getImportGeniusPool(), ['importgenius', 'importgenius_search', 'importgenius_search_backfill'], [
    ['country-date cursor', 'importgenius', "SELECT id FROM importgenius WHERE country = 'usa' ORDER BY mostRecentDate DESC, id DESC LIMIT 20"],
    ['country-target-date cursor', 'importgenius', "SELECT id FROM importgenius WHERE country = 'usa' AND isTarget = 1 ORDER BY mostRecentDate DESC, id DESC LIMIT 20"],
    ['country + product FULLTEXT page', 'importgenius_search', "SELECT i.id FROM importgenius i JOIN importgenius_search s ON s.importgenius_id = i.id WHERE i.country = 'usa' AND MATCH(s.product_description) AGAINST ('+shower* +door*' IN BOOLEAN MODE) ORDER BY i.mostRecentDate DESC, i.id DESC LIMIT 20"],
  ]);
  const importYeti = await inspectDatabase('ImportYeti', getImportYetiPool(), ['iy_shipments', 'iy_entities', 'iy_entity_relations', 'iy_crawl_targets'], [
    ['shipment date cursor', 'iy_shipments', 'SELECT id FROM iy_shipments ORDER BY arrival_date DESC, id DESC LIMIT 20'],
    ['entity global sort cursor', 'iy_entities', 'SELECT id FROM iy_entities ORDER BY total_shipments DESC, id DESC LIMIT 20'],
    ['shipment product FULLTEXT search', 'iy_shipments', "SELECT id FROM iy_shipments WHERE MATCH(product_description) AGAINST ('+glass* +door*' IN BOOLEAN MODE) LIMIT 20"],
    ['crawl queue claim', 'iy_crawl_targets', "SELECT id FROM iy_crawl_targets WHERE status = 'pending' AND depth <= 2 AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP()) ORDER BY depth, id LIMIT 1"],
    ['relation page aggregate', 'iy_entity_relations', 'SELECT entity_id, COUNT(DISTINCT neighbor_id) FROM (SELECT source_entity_id AS entity_id, target_entity_id AS neighbor_id FROM iy_entity_relations WHERE source_entity_id IN (1, 2) UNION ALL SELECT target_entity_id AS entity_id, source_entity_id AS neighbor_id FROM iy_entity_relations WHERE target_entity_id IN (1, 2)) relation_rows GROUP BY entity_id'],
  ]);
  return { generatedAt: new Date().toISOString(), importGenius, importYeti };
}

module.exports = { inspectDatabases };
