const axios = require('axios');
const cheerio = require('cheerio');
const { getPool } = require('../database/db');
const { cleanText, parseDate, parseNumber } = require('../crawler/parser');
const { getRobotsRules, isAllowedByRobots } = require('../crawler/robots');

const BASE_URL = 'https://www.importinfo.com';
const USER_AGENT = 'import-data-local/1.0';

function parseImportInfoProfileUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch (_) {
    throw new Error(`Expected a public ImportInfo company profile URL: ${value}`);
  }
  if (url.protocol !== 'https:' || !['www.importinfo.com', 'importinfo.com'].includes(url.hostname.toLowerCase()) ||
      !/^\/[a-z0-9][a-z0-9-]*\/?$/i.test(url.pathname) || url.search || url.hash) {
    throw new Error(`Only public ImportInfo company profile URLs are accepted: ${value}`);
  }
  return `${BASE_URL}${url.pathname.replace(/\/$/, '')}`;
}

function normalizeLabel(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tablePairs($, table) {
  const pairs = {};
  $(table).find('tr').each((_, row) => {
    const cells = $(row).find('th,td').toArray().map(cell => cleanText($(cell).text()));
    if (cells.length < 2 || !cells[0]) return;
    const label = normalizeLabel(cells[0]);
    const value = cleanText(cells.slice(1).join(' '));
    if (label) pairs[label] = value;
  });
  return pairs;
}

function firstValue(pairs, ...labels) {
  for (const label of labels) {
    const value = pairs[normalizeLabel(label)];
    if (value) return value;
  }
  return null;
}

function parseUnit(value, unitPattern) {
  const match = cleanText(value).match(unitPattern);
  return match ? match[1].toLowerCase() : null;
}

function countryNameFromCode(value) {
  const code = cleanText(value).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return name && name !== code ? name : null;
  } catch (_) {
    return null;
  }
}

function parseTariffCodes($, root) {
  const codes = new Set();
  $(root).find('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;
    const headerIndex = rows.findIndex(row => $(row).find('th').length > 0);
    const index = headerIndex < 0 ? 0 : headerIndex;
    const headers = $(rows[index]).find('th,td').toArray().map(cell => normalizeLabel($(cell).text()));
    const codeIndex = headers.findIndex(header => header === 'harmonized number' || header === 'hs code' || header === 'hts code');
    if (codeIndex < 0) return;

    for (const row of rows.slice(index + 1)) {
      const values = $(row).find('th,td').toArray().map(cell => cleanText($(cell).text()));
      const code = (values[codeIndex] || '').replace(/\D/g, '');
      if (/^\d{4,10}$/.test(code) && !/^0+$/.test(code)) codes.add(code);
    }
  });
  return [...codes];
}

function parseManifestBlock($, root, sourceUrl) {
  const tables = $(root).find('table').toArray();
  const maps = tables.map(table => tablePairs($, table));
  const overview = maps.find(map => firstValue(map, 'Master BOL #') || firstValue(map, 'House BOL #'));
  if (!overview) return null;
  const dates = maps.find(map => firstValue(map, 'Actual Arrival Date', 'Estimated Arrival Date')) || {};
  const houseBolNumber = firstValue(overview, 'House BOL #', 'BOL #');
  const masterBolNumber = firstValue(overview, 'Master BOL #');
  if (![houseBolNumber, masterBolNumber].some(value => value && /^[A-Z0-9]{6,64}$/i.test(value))) return null;

  const weightText = firstValue(overview, 'Weight in KG', 'Weight');
  const quantityText = firstValue(overview, 'Quantity');
  const countryCode = firstValue(maps.find(map => firstValue(map, 'Shipper Name')) || {}, 'Country Code');
  const foreignPort = firstValue(overview, 'Foreign Port of Lading');

  return {
    bolNumber: houseBolNumber,
    masterBolNumber,
    arrivalDate: parseDate(firstValue(dates, 'Actual Arrival Date', 'Estimated Arrival Date', 'Run Date')),
    supplierCountry: countryNameFromCode(countryCode),
    entryPort: firstValue(overview, 'Port of Unlading', 'US Port'),
    exitPort: foreignPort || firstValue(overview, 'Place of Receipt', 'Foreign Port'),
    weightValue: parseNumber(weightText),
    weightUnit: parseUnit(weightText, /\b(kg|kgs|lb|lbs)\b/i),
    quantityValue: parseNumber(quantityText),
    quantityUnit: parseUnit(quantityText, /\b([a-z]{2,8})\b/i),
    productDescription: firstValue(overview, 'Commodity Description', 'Cargo Description 1'),
    hsCodes: parseTariffCodes($, root),
    sourceUrl,
  };
}

function parseImportInfoProfile(html, sourceUrl) {
  const $ = cheerio.load(html);
  const title = cleanText($('title').first().text()).toLowerCase();
  const body = cleanText($('body').text()).toLowerCase();
  if (title.includes('just a moment') || body.includes('verify you are human') || body.includes('checking your browser')) {
    const error = new Error('ImportInfo returned an anti-bot challenge. The fetch stopped without attempting to bypass it.');
    error.blocked = true;
    error.statusCode = 403;
    throw error;
  }

  const records = [];
  $('.manifest').each((_, root) => {
    const record = parseManifestBlock($, root, sourceUrl);
    if (record) records.push(record);
  });
  return records;
}

function normalizedBol(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function matchesRecord(row, record) {
  const rowBol = normalizedBol(row.bol_number);
  const rowMaster = normalizedBol(row.master_bol_number);
  const publicHouse = normalizedBol(record.bolNumber);
  const publicMaster = normalizedBol(record.masterBolNumber);
  if (publicHouse) return rowBol.includes(publicHouse) || rowMaster === publicHouse;
  return Boolean(publicMaster && (rowMaster === publicMaster || rowBol === publicMaster));
}

function toObject(rawJson) {
  if (!rawJson) return {};
  if (typeof rawJson === 'object') return rawJson;
  try {
    return JSON.parse(rawJson);
  } catch (_) {
    return { originalRawJson: String(rawJson) };
  }
}

function isMissing(value) {
  const text = cleanText(value).toLowerCase();
  return !text || ['-', '—', 'n/a', 'null'].includes(text);
}

async function saveMatchedRecord(connection, row, record) {
  const changes = {};
  if (record.bolNumber && normalizedBol(row.bol_number).includes(normalizedBol(record.bolNumber))) {
    changes.bol_number = record.bolNumber;
  }
  if (record.masterBolNumber && isMissing(row.master_bol_number)) changes.master_bol_number = record.masterBolNumber;
  for (const field of ['arrival_date', 'supplier_country', 'entry_port', 'exit_port', 'weight_value', 'weight_unit', 'quantity_value', 'quantity_unit', 'product_description']) {
    const sourceKey = {
      arrival_date: 'arrivalDate', supplier_country: 'supplierCountry', entry_port: 'entryPort', exit_port: 'exitPort',
      weight_value: 'weightValue', weight_unit: 'weightUnit', quantity_value: 'quantityValue', quantity_unit: 'quantityUnit',
      product_description: 'productDescription',
    }[field];
    const current = row[field];
    const missing = current === null || current === undefined ||
      (typeof current === 'string' && isMissing(current)) ||
      (field === 'product_description' && isMissing(current));
    if (missing && record[sourceKey] !== null && record[sourceKey] !== undefined && !isMissing(record[sourceKey])) {
      changes[field] = record[sourceKey];
    }
  }

  const raw = toObject(row.raw_json);
  if (row.source_url && row.source_url !== record.sourceUrl && !raw.original_source_url) {
    raw.original_source_url = row.source_url;
  }
  const sources = Array.isArray(raw.supplemental_sources) ? raw.supplemental_sources : [];
  raw.importinfo_hs_code_status = record.hsCodes.length ? 'reported' : 'not_reported_in_public_manifest';
  raw.supplemental_sources = [
    ...sources.filter(item => item?.source_url !== record.sourceUrl),
    {
      source: 'ImportInfo public manifest',
      source_url: record.sourceUrl,
      fetched_at: new Date().toISOString(),
      bol_number: record.bolNumber,
      master_bol_number: record.masterBolNumber,
      hs_codes: record.hsCodes,
      hs_code_status: raw.importinfo_hs_code_status,
    },
  ];

  const assignments = Object.keys(changes).map(field => `\`${field}\` = ?`);
  const params = Object.values(changes);
  assignments.push('source_url = ?');
  params.push(record.sourceUrl);
  assignments.push('raw_json = ?');
  params.push(JSON.stringify(raw), row.id);
  await connection.execute(`UPDATE iy_shipments SET ${assignments.join(', ')}, last_seen_at = UTC_TIMESTAMP() WHERE id = ?`, params);
  if (record.hsCodes.length) {
    await connection.execute(
      `INSERT IGNORE INTO iy_shipment_hs_codes (shipment_id, hs_code)
       VALUES ${record.hsCodes.map(() => '(?, ?)').join(',')}`,
      record.hsCodes.flatMap(code => [row.id, code])
    );
  }
}

async function fetchImportInfoProfile(profileUrl) {
  const url = parseImportInfoProfileUrl(profileUrl);
  const rules = await getRobotsRules(BASE_URL, USER_AGENT);
  if (!isAllowedByRobots(url, rules)) {
    const error = new Error(`ImportInfo robots.txt disallows ${url}; the request was stopped.`);
    error.blocked = true;
    error.statusCode = 403;
    throw error;
  }

  let response;
  try {
    response = await axios.get(url, {
      timeout: 25000,
      maxRedirects: 3,
      responseType: 'text',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8' },
      validateStatus: status => status >= 200 && status < 500,
    });
  } catch (error) {
    throw new Error(`ImportInfo request failed: ${error.message}`);
  }
  const finalUrl = response.request?.res?.responseUrl || url;
  if (new URL(finalUrl).hostname !== 'www.importinfo.com') {
    const error = new Error(`ImportInfo redirected outside the approved host: ${new URL(finalUrl).hostname}`);
    error.blocked = true;
    throw error;
  }
  if ([401, 403, 429].includes(response.status)) {
    const error = new Error(`ImportInfo returned HTTP ${response.status}; no retry or access-control bypass was attempted.`);
    error.blocked = true;
    error.statusCode = response.status;
    throw error;
  }
  if (response.status !== 200 || typeof response.data !== 'string') {
    throw new Error(`Unexpected ImportInfo response: HTTP ${response.status}`);
  }
  return { url, records: parseImportInfoProfile(response.data, url) };
}

async function enrichFromImportInfo(profileUrl) {
  const { url, records } = await fetchImportInfoProfile(profileUrl);
  if (!records.length) {
    console.log(`No public bill-of-lading detail blocks were available at ${url}.`);
    return { records: 0, matched: 0 };
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  let matched = 0;
  try {
    const recordsWithIdentifiers = records.map(record => {
      const identifiers = [record.bolNumber, record.masterBolNumber]
        .map(value => String(value || '').trim())
        .filter(value => /^[A-Z0-9]{6,64}$/i.test(value));
      return { record, identifiers: [...new Set(identifiers)] };
    }).filter(item => item.identifiers.length);
    for (let start = 0; start < recordsWithIdentifiers.length; start += 20) {
      const chunk = recordsWithIdentifiers.slice(start, start + 20);
      const identifiers = [...new Set(chunk.flatMap(item => item.identifiers))];
      const slots = identifiers.map(() => '?').join(',');
      const params = [...identifiers, ...identifiers, ...identifiers.map(value => `${value}%`), ...identifiers.map(value => `${value}%`)];
      const [rows] = await connection.execute(
        `SELECT id, bol_number, master_bol_number, arrival_date, supplier_country, entry_port, exit_port,
          weight_value, weight_unit, quantity_value, quantity_unit, product_description, source_url, raw_json
         FROM iy_shipments
         WHERE bol_number IN (${slots}) OR master_bol_number IN (${slots})
           OR bol_number LIKE ?${identifiers.length > 1 ? ' OR bol_number LIKE ?'.repeat(identifiers.length - 1) : ''}
           OR master_bol_number LIKE ?${identifiers.length > 1 ? ' OR master_bol_number LIKE ?'.repeat(identifiers.length - 1) : ''}`,
        params
      );
      for (const item of chunk) {
        for (const row of rows) {
          if (!matchesRecord(row, item.record)) continue;
          await connection.beginTransaction();
          try {
            await saveMatchedRecord(connection, row, item.record);
            await connection.commit();
            matched += 1;
          } catch (error) {
            await connection.rollback();
            throw error;
          }
        }
      }
    }
  } finally {
    connection.release();
  }
  console.log(`ImportInfo public profiles: ${records.length} manifest(s), ${matched} matched shipment row(s) updated.`);
  return { records: records.length, matched };
}

module.exports = { parseImportInfoProfileUrl, parseImportInfoProfile, enrichFromImportInfo };
