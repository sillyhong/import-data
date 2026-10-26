const { getPool, hasFullTextIndex } = require('../../importgenius/database/db');

const COUNTRIES = new Set(['usa', 'india', 'vietnam', 'argentina', 'chile', 'colombia', 'costarica', 'ecuador', 'panama', 'peru', 'paraguay', 'uruguay', 'venezuela']);
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10000000;

function safeInteger(value, fallback, min, max, label) {
  const number = Number(value === undefined ? fallback : value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} 必须是 ${min} 到 ${max} 之间的整数。`), { status: 400 });
  }
  return number;
}

function queryDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error(`${label} 必须使用 YYYY-MM-DD 格式。`), { status: 400 });
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error(`${label} 不是有效日期。`), { status: 400 });
  }
  return date;
}

function addDateRange(conditions, params, column, from, to) {
  if (from) {
    conditions.push(`${column} >= ?`);
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    conditions.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(`${to} 00:00:00`);
  }
}

function validateDateRange(from, to, label) {
  if (from && to && from > to) {
    throw Object.assign(new Error(`${label}的开始日期不能晚于结束日期。`), { status: 400 });
  }
}

function buildFullTextQuery(value) {
  const tokens = String(value || '').trim().match(/[\p{L}\p{N}]+/gu) || [];
  if (!tokens.length) throw Object.assign(new Error('关键词需包含字母或数字。'), { status: 400 });
  return tokens.slice(0, 8).map(token => `+${token}*`).join(' ');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!cursor || !Number.isSafeInteger(Number(cursor.id)) || Number(cursor.id) < 1 ||
        !(cursor.date === null || /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(cursor.date))) {
      throw new Error('invalid cursor');
    }
    return { id: Number(cursor.id), date: cursor.date };
  } catch (_) {
    throw Object.assign(new Error('分页游标无效，请重新查询。'), { status: 400 });
  }
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ id: Number(row.id), date: row.mostRecentDate || null })).toString('base64url');
}

async function getImportgenius(ctx) {
  try {
    const pool = getPool();
    const pageSize = safeInteger(ctx.query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, 'pageSize');
    const requestedPage = safeInteger(ctx.query.page, 1, 1, MAX_PAGE, 'page');
    const country = String(ctx.query.country || '').trim().toLowerCase();
    if (country && !COUNTRIES.has(country)) throw Object.assign(new Error('国家参数无效。'), { status: 400 });
    const keyword = String(ctx.query.keyword || '').trim();
    if (keyword.length > 120) throw Object.assign(new Error('关键词不能超过 120 个字符。'), { status: 400 });
    const cursor = decodeCursor(ctx.query.cursor);
    const mostRecentFrom = queryDate(ctx.query.mostRecentFrom, '最新进口日期开始日期');
    const mostRecentTo = queryDate(ctx.query.mostRecentTo, '最新进口日期结束日期');
    const createdFrom = queryDate(ctx.query.createdFrom, '数据创建时间开始日期');
    const createdTo = queryDate(ctx.query.createdTo, '数据创建时间结束日期');
    validateDateRange(mostRecentFrom, mostRecentTo, '最新进口日期');
    validateDateRange(createdFrom, createdTo, '数据创建时间');
    const [[createdAtColumn]] = await pool.execute(
      `SELECT COUNT(*) AS columnCount FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'importgenius' AND COLUMN_NAME = 'createdAt'`
    );
    const creationTimeAvailable = Number(createdAtColumn?.columnCount || 0) > 0;
    if (!creationTimeAvailable && (createdFrom || createdTo)) {
      throw Object.assign(new Error('数据库尚未添加数据创建时间字段，请先运行“盘点并补齐索引”任务。'), { status: 409 });
    }
    const conditions = [];
    const params = [];
    let useFullTextSearch = false;
    if (country) {
      conditions.push('i.country = ?');
      params.push(country);
    }
    if (keyword) {
      useFullTextSearch = await hasFullTextIndex();
      if (useFullTextSearch) {
        conditions.push('MATCH(igs.product_description) AGAINST (? IN BOOLEAN MODE)');
        params.push(buildFullTextQuery(keyword));
      } else {
        // Keep keyword searches available while the side table is being built.
        // This uses the pre-indexed source column and may be slower on large datasets.
        conditions.push('i.product_description_generated LIKE ?');
        params.push(`%${keyword}%`);
      }
    }
    if (ctx.query.mostRecentDate) {
      conditions.push('i.mostRecentDate = ?');
      params.push(ctx.query.mostRecentDate);
    }
    addDateRange(conditions, params, 'i.mostRecentDate', mostRecentFrom, mostRecentTo);
    if (creationTimeAvailable) addDateRange(conditions, params, 'i.createdAt', createdFrom, createdTo);
    if (ctx.query.url) {
      conditions.push('i.url = ?');
      params.push(String(ctx.query.url).slice(0, 512));
    }
    if (['0', '1', '2'].includes(String(ctx.query.isTarget))) {
      conditions.push('i.isTarget = ?');
      params.push(Number(ctx.query.isTarget));
    }
    const filterWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const filterParams = [...params];
    if (cursor) {
      if (cursor.date === null) {
        conditions.push('(i.mostRecentDate IS NULL AND i.id < ?)');
        params.push(cursor.id);
      } else {
        conditions.push('(i.mostRecentDate < ? OR (i.mostRecentDate = ? AND i.id < ?) OR i.mostRecentDate IS NULL)');
        params.push(cursor.date, cursor.date, cursor.id);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const searchJoin = useFullTextSearch ? 'INNER JOIN importgenius_search igs ON igs.importgenius_id = i.id' : '';
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM importgenius i ${searchJoin} ${filterWhere}`,
      filterParams
    );
    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const offset = (page - 1) * pageSize;
    const paginationSql = cursor ? `LIMIT ${pageSize + 1}` : `LIMIT ${pageSize + 1} OFFSET ${offset}`;
    const [rows] = await pool.execute(
      `SELECT i.id, i.mostRecentDate, ${creationTimeAvailable ? 'i.createdAt' : 'NULL AS createdAt'}, i.company, i.contactInfo, i.totalShipments, i.url, i.country, i.isTarget, i.raw
       FROM importgenius i ${searchJoin} ${where}
       ORDER BY i.mostRecentDate DESC, i.id DESC
       ${paginationSql}`,
      params
    );
    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    ctx.body = {
      data,
      hasMore,
      nextCursor: hasMore && data.length ? encodeCursor(data[data.length - 1]) : null,
      total,
      totalPages,
      page,
      pageSize,
      creationTimeAvailable,
    };
  } catch (error) {
    if (error.status) {
      ctx.status = error.status;
      ctx.body = { message: error.message };
      return;
    }
    console.error('ImportGenius query failed:', error.message);
    ctx.status = /TASK_ENV|database settings/.test(error.message) ? 503 : 500;
    ctx.body = { message: ctx.status === 503 ? 'ImportGenius 数据库环境尚未配置。' : 'ImportGenius 数据查询失败，请检查数据库和索引。' };
  }
}

async function updateImportGenius(ctx) {
  const { id, isTarget } = ctx.request.body || {};
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || ![0, 1, 2].includes(Number(isTarget))) {
    ctx.status = 400;
    ctx.body = { message: '记录 ID 或目标客户状态无效。' };
    return;
  }
  try {
    const [result] = await getPool().execute('UPDATE importgenius SET isTarget = ? WHERE id = ?', [Number(isTarget), Number(id)]);
    if (!result.affectedRows) {
      ctx.status = 404;
      ctx.body = { message: '记录不存在。' };
      return;
    }
    ctx.body = { message: '记录已更新。' };
  } catch (error) {
    console.error('ImportGenius update failed:', error.message);
    ctx.status = 500;
    ctx.body = { message: '记录更新失败，请检查数据库连接。' };
  }
}

module.exports = { updateImportGenius, getImportgenius };
