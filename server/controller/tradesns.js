const fs = require('fs/promises');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'tradesns');
const CATEGORIES = new Set(['glass-door-handles', 'hscode', 'shower-hinges', 'shower-door']);
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10000000;

function positiveInteger(value, fallback, max, label) {
  const number = Number(value === undefined || value === '' ? fallback : value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw Object.assign(new Error(`${label} 必须是 1 到 ${max} 之间的整数。`), { status: 400 });
  }
  return number;
}

async function getTradesns(ctx) {
  try {
    const category = String(ctx.query.category || '').trim().toLowerCase();
    if (!CATEGORIES.has(category)) throw Object.assign(new Error('TradeSNS 数据类别无效。'), { status: 400 });
    const page = positiveInteger(ctx.query.page, 1, MAX_PAGE, 'page');
    const pageSize = positiveInteger(ctx.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, 'pageSize');
    const categoryPath = path.join(DATA_ROOT, category);
    let files;
    try {
      files = await fs.readdir(categoryPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        ctx.body = { data: [], total: 0, totalPages: 0, page: 1, pageSize };
        return;
      }
      throw error;
    }

    const pageFiles = files
      .map(name => name.match(/^(\d+)\.json$/))
      .filter(Boolean)
      .sort((left, right) => Number(left[1]) - Number(right[1]));
    const rows = [];
    for (const [match] of pageFiles) {
      const source = JSON.parse(await fs.readFile(path.join(categoryPath, match), 'utf8'));
      if (!Array.isArray(source)) throw new Error(`TradeSNS 数据文件格式无效：${match}`);
      rows.push(...source);
    }

    const visibleRows = rows.filter(row => row.websiteUrl?.length);
    const total = visibleRows.length;
    const totalPages = Math.ceil(total / pageSize);
    const normalizedPage = Math.min(page, Math.max(totalPages, 1));
    const offset = (normalizedPage - 1) * pageSize;
    ctx.body = {
      data: visibleRows.slice(offset, offset + pageSize),
      total,
      totalPages,
      page: normalizedPage,
      pageSize,
    };
  } catch (error) {
    if (error.status) {
      ctx.status = error.status;
      ctx.body = { message: error.message };
      return;
    }
    console.error('TradeSNS query failed:', error.message);
    ctx.status = 500;
    ctx.body = { message: 'TradeSNS 数据查询失败。' };
  }
}

module.exports = { getTradesns };
