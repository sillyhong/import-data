const { getPool, hasPerformanceIndex } = require('../../importyeti/database/db');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10000000;
const MAX_KEYWORD_LENGTH = 120;

function getPageSize(query) {
  const pageSize = Number(query.pageSize || DEFAULT_PAGE_SIZE);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw Object.assign(new Error(`pageSize 必须是 1 到 ${MAX_PAGE_SIZE} 之间的整数。`), { status: 400 });
  }
  return pageSize;
}

function getPage(query) {
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    throw Object.assign(new Error(`page 必须是 1 到 ${MAX_PAGE} 之间的整数。`), { status: 400 });
  }
  return page;
}

function getKeyword(value) {
  const keyword = String(value || '').trim();
  if (keyword.length > MAX_KEYWORD_LENGTH) throw Object.assign(new Error(`搜索关键词不能超过 ${MAX_KEYWORD_LENGTH} 个字符。`), { status: 400 });
  return keyword;
}

function getDateRange(query) {
  const fromDate = String(query.fromDate || '').trim();
  const toDate = String(query.toDate || '').trim();
  const valid = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  if ((fromDate && !valid(fromDate)) || (toDate && !valid(toDate))) {
    throw Object.assign(new Error('日期格式必须为 YYYY-MM-DD。'), { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) throw Object.assign(new Error('开始日期不能晚于结束日期。'), { status: 400 });
  return { fromDate, toDate };
}

function booleanFullText(value) {
  const tokens = String(value || '').match(/[\p{L}\p{N}]+/gu) || [];
  return tokens.slice(0, 8).map(token => `+${token}*`).join(' ');
}

function decodeCursor(value, kind) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const id = Number(parsed.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('invalid id');
    if (kind === 'shipment') {
      if (!(parsed.date === null || /^\d{4}-\d{2}-\d{2}$/.test(parsed.date))) throw new Error('invalid date');
      return { id, date: parsed.date };
    }
    const shipments = parsed.shipments === null ? null : Number(parsed.shipments);
    if (shipments !== null && (!Number.isSafeInteger(shipments) || shipments < 0)) throw new Error('invalid count');
    return { id, shipments };
  } catch (_) {
    throw Object.assign(new Error('分页游标无效，请重新查询。'), { status: 400 });
  }
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sendQueryError(ctx, error) {
  if (error.status) {
    ctx.status = error.status;
    ctx.body = { message: error.message };
    return;
  }
  console.error('ImportYeti query failed:', error.message);
  if (/Missing .*database settings|TASK_ENV must/.test(error.message)) {
    ctx.status = 503;
    ctx.body = { message: 'ImportYeti MySQL 当前部署环境尚未配置。' };
    return;
  }
  ctx.status = 500;
  ctx.body = { message: 'ImportYeti 数据查询失败，请确认数据库连接和 iy_* 表已就绪。' };
}

async function estimatedTableRows(pool, tables) {
  const [rows] = await pool.execute(
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')})`,
    tables
  );
  return new Map(rows.map(row => [row.TABLE_NAME, Number(row.TABLE_ROWS) || 0]));
}

async function getImportYetiSummary(ctx) {
  try {
    const pool = getPool();
    const estimates = await estimatedTableRows(pool, ['iy_shipments', 'iy_entities']);
    ctx.body = {
      shipments: estimates.get('iy_shipments') || 0,
      companies: null,
      suppliers: null,
      entities: estimates.get('iy_entities') || 0,
      approximate: true,
    };
  } catch (error) {
    sendQueryError(ctx, error);
  }
}

async function getImportYetiShipments(ctx) {
  try {
    const pageSize = getPageSize(ctx.query);
    const requestedPage = getPage(ctx.query);
    const keyword = getKeyword(ctx.query.keyword);
    const { fromDate, toDate } = getDateRange(ctx.query);
    const cursor = decodeCursor(ctx.query.cursor, 'shipment');
    const where = [];
    const params = [];

    if (keyword) {
      const search = booleanFullText(keyword);
      const exactBol = keyword.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!(await hasPerformanceIndex('iy_shipments', ['product_description'], 'FULLTEXT')) ||
          !(await hasPerformanceIndex('iy_entities', ['name', 'slug', 'address'], 'FULLTEXT'))) {
        throw Object.assign(new Error('全文搜索索引尚未就绪，请先在任务页执行“初始化表与索引”。'), { status: 503 });
      }
      where.push(`((s.bol_number = ? OR s.master_bol_number = ? OR s.bol_number = ? OR s.master_bol_number = ?)
        OR MATCH(s.product_description) AGAINST (? IN BOOLEAN MODE)
        OR MATCH(c.name, c.slug, c.address) AGAINST (? IN BOOLEAN MODE)
        OR MATCH(p.name, p.slug, p.address) AGAINST (? IN BOOLEAN MODE))`);
      params.push(keyword, keyword, exactBol || keyword, exactBol || keyword, search || keyword, search || keyword, search || keyword);
    }
    if (fromDate) {
      where.push('s.arrival_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      where.push('s.arrival_date < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(toDate);
    }
    const filterWhereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const filterParams = [...params];
    if (cursor) {
      if (cursor.date === null) {
        where.push('(s.arrival_date IS NULL AND s.id < ?)');
        params.push(cursor.id);
      } else {
        where.push('(s.arrival_date < ? OR (s.arrival_date = ? AND s.id < ?) OR s.arrival_date IS NULL)');
        params.push(cursor.date, cursor.date, cursor.id);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pool = getPool();
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM iy_shipments s
       LEFT JOIN iy_entities c ON c.id = s.company_entity_id
       LEFT JOIN iy_entities p ON p.id = s.supplier_entity_id
       ${filterWhereSql}`,
      filterParams
    );
    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const offset = (page - 1) * pageSize;
    const paginationSql = cursor ? `LIMIT ${pageSize + 1}` : `LIMIT ${pageSize + 1} OFFSET ${offset}`;
    const [rows] = await pool.execute(
      `SELECT s.id, s.bol_number, s.master_bol_number,
        DATE_FORMAT(s.arrival_date, '%Y-%m-%d') AS arrival_date,
        c.name AS company_name, c.slug AS company_slug,
        p.name AS supplier_name, p.slug AS supplier_slug,
        s.supplier_country, s.entry_port, s.exit_port,
        s.weight_value, s.weight_unit, s.quantity_value, s.quantity_unit, s.container_count,
        s.product_description, s.source_url,
        JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.importinfo_hs_code_status')) AS hs_code_status
       FROM iy_shipments s
       LEFT JOIN iy_entities c ON c.id = s.company_entity_id
       LEFT JOIN iy_entities p ON p.id = s.supplier_entity_id
       ${whereSql}
       ORDER BY s.arrival_date DESC, s.id DESC
       ${paginationSql}`,
      params
    );
    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    if (data.length) {
      const ids = data.map(row => row.id);
      const [hsRows] = await pool.query(
        `SELECT shipment_id, hs_code FROM iy_shipment_hs_codes
         WHERE shipment_id IN (${ids.map(() => '?').join(',')}) ORDER BY hs_code`,
        ids
      );
      const codesByShipment = new Map();
      for (const row of hsRows) {
        const codes = codesByShipment.get(String(row.shipment_id)) || [];
        codes.push(row.hs_code);
        codesByShipment.set(String(row.shipment_id), codes);
      }
      for (const row of data) row.hs_codes = (codesByShipment.get(String(row.id)) || []).join(', ');
    }
    const last = data[data.length - 1];
    ctx.body = {
      data,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ id: Number(last.id), date: last.arrival_date || null }) : null,
      total,
      totalPages,
      page,
      pageSize,
    };
  } catch (error) {
    sendQueryError(ctx, error);
  }
}

async function getImportYetiEntities(ctx) {
  try {
    const pageSize = getPageSize(ctx.query);
    const requestedPage = getPage(ctx.query);
    const keyword = getKeyword(ctx.query.keyword);
    const entityType = String(ctx.query.entityType || '').trim();
    if (entityType && !['company', 'supplier'].includes(entityType)) throw Object.assign(new Error('entityType 仅支持 company 或 supplier。'), { status: 400 });
    const cursor = decodeCursor(ctx.query.cursor, 'entity');
    const where = [];
    const params = [];
    if (entityType) {
      where.push('e.entity_type = ?');
      params.push(entityType);
    }
    if (keyword) {
      if (!(await hasPerformanceIndex('iy_entities', ['name', 'slug', 'address'], 'FULLTEXT'))) {
        throw Object.assign(new Error('全文搜索索引尚未就绪，请先在任务页执行“初始化表与索引”。'), { status: 503 });
      }
      where.push('MATCH(e.name, e.slug, e.address) AGAINST (? IN BOOLEAN MODE)');
      params.push(booleanFullText(keyword) || keyword);
    }
    const filterWhereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const filterParams = [...params];
    if (cursor) {
      if (cursor.shipments === null) {
        where.push('(e.total_shipments IS NULL AND e.id < ?)');
        params.push(cursor.id);
      } else {
        where.push('(e.total_shipments < ? OR e.total_shipments IS NULL OR (e.total_shipments = ? AND e.id < ?))');
        params.push(cursor.shipments, cursor.shipments, cursor.id);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pool = getPool();
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM iy_entities e ${filterWhereSql}`,
      filterParams
    );
    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const offset = (page - 1) * pageSize;
    const paginationSql = cursor ? `LIMIT ${pageSize + 1}` : `LIMIT ${pageSize + 1} OFFSET ${offset}`;
    const [rows] = await pool.execute(
      `SELECT e.id, e.entity_type, e.slug, e.name, e.country_code, e.address,
        e.website, e.total_shipments,
        DATE_FORMAT(e.last_crawled_at, '%Y-%m-%d %H:%i:%s') AS last_crawled_at,
        e.source_url
       FROM iy_entities e
       ${whereSql}
       ORDER BY e.total_shipments DESC, e.id DESC
       ${paginationSql}`,
      params
    );
    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    if (data.length) {
      const ids = data.map(row => row.id);
      const slots = ids.map(() => '?').join(',');
      const [relations] = await pool.query(
        `SELECT entity_id, COUNT(DISTINCT neighbor_id) AS relation_count
         FROM (
           SELECT source_entity_id AS entity_id, target_entity_id AS neighbor_id
           FROM iy_entity_relations WHERE source_entity_id IN (${slots})
           UNION ALL
           SELECT target_entity_id AS entity_id, source_entity_id AS neighbor_id
           FROM iy_entity_relations WHERE target_entity_id IN (${slots})
         ) relation_rows
         GROUP BY entity_id`,
        [...ids, ...ids]
      );
      const counts = new Map(relations.map(row => [String(row.entity_id), Number(row.relation_count)]));
      for (const row of data) row.relation_count = counts.get(String(row.id)) || 0;
    }
    const last = data[data.length - 1];
    ctx.body = {
      data,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ id: Number(last.id), shipments: last.total_shipments === null ? null : Number(last.total_shipments) }) : null,
      total,
      totalPages,
      page,
      pageSize,
    };
  } catch (error) {
    sendQueryError(ctx, error);
  }
}

module.exports = { getImportYetiSummary, getImportYetiShipments, getImportYetiEntities };
