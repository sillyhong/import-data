const crypto = require('crypto');
const axios = require('axios');
const { getPool } = require('../database/db');
const { getDataSourceOption } = require('../../config/environment');
const { parseProfileUrl, parseProfile, hashRecord } = require('./parser');
const { getRobotsRules, isAllowedByRobots } = require('./robots');

const BASE_URL = 'https://www.importyeti.com';

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getCrawlerConfig() {
  return {
    delayMs: Math.max(2000, Number(getDataSourceOption('importyeti', 'IMPORTYETI_DELAY_MS', 3000))),
    userAgent: getDataSourceOption('importyeti', 'IMPORTYETI_USER_AGENT', 'import-data-local/1.0'),
    storeRawHtml: getDataSourceOption('importyeti', 'IMPORTYETI_STORE_RAW_HTML', '0') === '1',
    timeoutMs: Math.max(10000, Number(getDataSourceOption('importyeti', 'IMPORTYETI_TIMEOUT_MS', 25000))),
  };
}

async function fetchPage(url, config) {
  let response;
  try {
    response = await axios.get(url, {
      timeout: config.timeoutMs,
      maxRedirects: 3,
      responseType: 'text',
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.8',
      },
      validateStatus: status => status >= 200 && status < 500,
    });
  } catch (error) {
    throw new Error(`Request failed: ${error.message}`);
  }

  const finalUrl = response.request?.res?.responseUrl || url;
  const parsedFinal = new URL(finalUrl);
  if (parsedFinal.hostname !== 'www.importyeti.com') {
    const error = new Error(`Redirected outside the approved host: ${parsedFinal.hostname}`);
    error.blocked = true;
    error.statusCode = response.status;
    throw error;
  }
  if (response.status === 403 || response.status === 429) {
    const error = new Error(`The site returned HTTP ${response.status}; the crawl has been paused.`);
    error.blocked = true;
    error.statusCode = response.status;
    throw error;
  }
  if (response.status !== 200 || typeof response.data !== 'string') {
    const error = new Error(`Unexpected response: HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return { html: response.data, finalUrl };
}

async function upsertEntity(connection, profile, isFetchedProfile = false) {
  const [result] = await connection.execute(
    `INSERT INTO iy_entities
      (entity_type, slug, name, address, country_code, website, total_shipments, last_seen_at, last_crawled_at, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), last_seen_at = UTC_TIMESTAMP()`,
    [profile.entityType, profile.slug, profile.name, profile.address, profile.countryCode, profile.website,
      profile.totalShipments, isFetchedProfile ? new Date() : null, profile.sourceUrl]
  );
  const entityId = result.insertId;
  if (!entityId) throw new Error(`Could not resolve entity id for ${profile.entityType}/${profile.slug}`);
  if (isFetchedProfile) {
    await connection.execute(
      `UPDATE iy_entities SET name = COALESCE(?, name), address = COALESCE(?, address),
       country_code = COALESCE(?, country_code), website = COALESCE(?, website),
       total_shipments = COALESCE(?, total_shipments), last_crawled_at = UTC_TIMESTAMP(), source_url = ?
       WHERE id = ?`,
      [profile.name, profile.address, profile.countryCode, profile.website, profile.totalShipments, profile.sourceUrl, entityId]
    );
  }
  return entityId;
}

async function upsertRelatedEntities(connection, relations) {
  const unique = new Map();
  for (const relation of relations) {
    unique.set(`${relation.entityType}/${relation.slug}`, relation);
  }
  const rows = [...unique.values()];
  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    await connection.execute(
      `INSERT INTO iy_entities (entity_type, slug, name, address, country_code, website, total_shipments, last_seen_at, source_url)
       VALUES ${chunk.map(() => '(?, ?, ?, NULL, NULL, NULL, NULL, UTC_TIMESTAMP(), ?)').join(',')}
       ON DUPLICATE KEY UPDATE last_seen_at = UTC_TIMESTAMP()`,
      chunk.flatMap(relation => [relation.entityType, relation.slug, relation.name, relation.url])
    );
  }
  const ids = new Map();
  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    const tupleSql = chunk.map(() => '(?, ?)').join(',');
    const params = chunk.flatMap(relation => [relation.entityType, relation.slug]);
    const [resolved] = await connection.execute(
      `SELECT id, entity_type, slug FROM iy_entities WHERE (entity_type, slug) IN (${tupleSql})`,
      params
    );
    for (const row of resolved) ids.set(`${row.entity_type}/${row.slug}`, row.id);
  }
  return ids;
}

async function upsertRelations(connection, parsed, currentEntityId, relatedEntityIds) {
  for (let start = 0; start < parsed.relations.length; start += 100) {
    const chunk = parsed.relations.slice(start, start + 100)
      .filter(relation => relatedEntityIds.has(`${relation.entityType}/${relation.slug}`));
    if (!chunk.length) continue;
    await connection.execute(
      `INSERT INTO iy_entity_relations (source_entity_id, target_entity_id, relation_type, shipment_count, source_url, raw_json)
       VALUES ${chunk.map(() => "(?, ?, 'trades_with', ?, ?, ?)").join(',')}
       ON DUPLICATE KEY UPDATE shipment_count = COALESCE(VALUES(shipment_count), shipment_count),
         observed_at = UTC_TIMESTAMP(), raw_json = VALUES(raw_json)`,
      chunk.flatMap(relation => [currentEntityId, relatedEntityIds.get(`${relation.entityType}/${relation.slug}`),
        relation.shipmentCount, parsed.profile.sourceUrl, JSON.stringify({ rowText: relation.rowText })])
    );
  }
}

function buildShipmentRows(parsed, currentEntityId, relatedEntityIds) {
  const byKey = new Map();
  for (const shipment of parsed.shipments) {
    const companyEntityId = parsed.profile.entityType === 'company'
      ? currentEntityId
      : (shipment.counterpartyType === 'company' ? relatedEntityIds.get(`company/${shipment.counterpartySlug}`) || null : null);
    const supplierEntityId = parsed.profile.entityType === 'supplier'
      ? currentEntityId
      : (shipment.counterpartyType === 'supplier' ? relatedEntityIds.get(`supplier/${shipment.counterpartySlug}`) || null : null);
    const recordKey = shipment.bolNumber
      ? shipment.bolNumber.toUpperCase()
      : hashRecord({ entity: `${parsed.profile.entityType}/${parsed.profile.slug}`, raw: shipment.raw });
    const existing = byKey.get(recordKey);
    if (existing) {
      existing.hsCodes = [...new Set([...existing.hsCodes, ...(shipment.hsCodes || [])])];
      continue;
    }
    byKey.set(recordKey, {
      recordKey,
      hsCodes: shipment.hsCodes || [],
      params: [recordKey, shipment.bolNumber, shipment.masterBolNumber, shipment.arrivalDate, companyEntityId, supplierEntityId,
        shipment.supplierCountry, shipment.entryPort, shipment.exitPort, shipment.weightValue, shipment.weightUnit,
        shipment.quantityValue, shipment.quantityUnit, shipment.containerCount, shipment.productDescription,
        shipment.sourceUrl, JSON.stringify(shipment.raw)],
    });
  }
  return [...byKey.values()];
}

async function upsertShipments(connection, shipmentRows) {
  const shipmentHsRows = [];
  for (let start = 0; start < shipmentRows.length; start += 25) {
    const chunk = shipmentRows.slice(start, start + 25);
    await connection.execute(
      `INSERT INTO iy_shipments
        (source_system, record_key, bol_number, master_bol_number, arrival_date, company_entity_id, supplier_entity_id,
         supplier_country, entry_port, exit_port, weight_value, weight_unit, quantity_value, quantity_unit, container_count,
         product_description, source_url, raw_json, first_seen_at, last_seen_at)
       VALUES ${chunk.map(() => "('importyeti', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())").join(',')}
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         master_bol_number = COALESCE(VALUES(master_bol_number), master_bol_number),
         arrival_date = COALESCE(VALUES(arrival_date), arrival_date),
         company_entity_id = COALESCE(VALUES(company_entity_id), company_entity_id),
         supplier_entity_id = COALESCE(VALUES(supplier_entity_id), supplier_entity_id),
         supplier_country = COALESCE(VALUES(supplier_country), supplier_country),
         entry_port = COALESCE(VALUES(entry_port), entry_port),
         exit_port = COALESCE(VALUES(exit_port), exit_port),
         weight_value = COALESCE(VALUES(weight_value), weight_value),
         weight_unit = COALESCE(VALUES(weight_unit), weight_unit),
         quantity_value = COALESCE(VALUES(quantity_value), quantity_value),
         quantity_unit = COALESCE(VALUES(quantity_unit), quantity_unit),
         container_count = COALESCE(VALUES(container_count), container_count),
         product_description = COALESCE(VALUES(product_description), product_description),
         source_url = IF(
           JSON_CONTAINS_PATH(raw_json, 'one', '$.supplemental_sources[0].source_url'),
           JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.supplemental_sources[0].source_url')),
           VALUES(source_url)
         ),
         raw_json = CASE
           WHEN JSON_CONTAINS_PATH(raw_json, 'one', '$.supplemental_sources') THEN JSON_SET(
             VALUES(raw_json),
             '$.supplemental_sources', JSON_EXTRACT(raw_json, '$.supplemental_sources'),
             '$.original_source_url', COALESCE(JSON_EXTRACT(raw_json, '$.original_source_url'), JSON_QUOTE(VALUES(source_url)))
           )
           ELSE VALUES(raw_json)
         END,
         last_seen_at = UTC_TIMESTAMP()`,
      chunk.flatMap(row => row.params)
    );
    const keys = chunk.map(row => row.recordKey);
    const [resolved] = await connection.execute(
      `SELECT id, record_key FROM iy_shipments WHERE source_system = 'importyeti' AND record_key IN (${keys.map(() => '?').join(',')})`,
      keys
    );
    const ids = new Map(resolved.map(row => [row.record_key, row.id]));
    for (const row of chunk) {
      const shipmentId = ids.get(row.recordKey);
      if (shipmentId) for (const hsCode of row.hsCodes) shipmentHsRows.push([shipmentId, hsCode]);
    }
  }
  for (let start = 0; start < shipmentHsRows.length; start += 300) {
    const chunk = shipmentHsRows.slice(start, start + 300);
    await connection.execute(
      `INSERT IGNORE INTO iy_shipment_hs_codes (shipment_id, hs_code) VALUES ${chunk.map(() => '(?, ?)').join(',')}`,
      chunk.flat()
    );
  }
}

async function saveProfile(parsed, html, config) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const currentEntityId = await upsertEntity(connection, parsed.profile, true);
    const contentHash = crypto.createHash('sha256').update(html).digest('hex');
    const snapshotJson = JSON.stringify(parsed.profile);
    await connection.execute(
      `INSERT IGNORE INTO iy_entity_snapshots (entity_id, content_hash, profile_json, raw_html)
       VALUES (?, ?, ?, ?)`,
      [currentEntityId, contentHash, snapshotJson, config.storeRawHtml ? html : null]
    );

    if (parsed.htsCodes.length) {
      const values = parsed.htsCodes.map(() => '(?, ?, ?, ?)').join(',');
      const params = parsed.htsCodes.flatMap(code => [currentEntityId, code.code, code.description, code.shipmentCount]);
      await connection.execute(
        `INSERT INTO iy_entity_hs_codes (entity_id, hs_code, description, shipment_count)
         VALUES ${values}
         ON DUPLICATE KEY UPDATE description = COALESCE(VALUES(description), description), shipment_count = COALESCE(VALUES(shipment_count), shipment_count)`,
        params
      );
    }

    const countryStats = parsed.countryStats.filter(stat => stat.countryName);
    for (let start = 0; start < countryStats.length; start += 100) {
      const chunk = countryStats.slice(start, start + 100);
      await connection.execute(
        `INSERT INTO iy_entity_country_stats (entity_id, region_name, country_name, shipment_count)
         VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(',')}
         ON DUPLICATE KEY UPDATE shipment_count = COALESCE(VALUES(shipment_count), shipment_count)`,
        chunk.flatMap(stat => [currentEntityId, stat.regionName || '', stat.countryName, stat.shipmentCount])
      );
    }

    const relatedEntityIds = await upsertRelatedEntities(connection, parsed.relations);
    await upsertRelations(connection, parsed, currentEntityId, relatedEntityIds);
    const shipmentRows = buildShipmentRows(parsed, currentEntityId, relatedEntityIds);
    await upsertShipments(connection, shipmentRows);

    await connection.execute(
      `UPDATE iy_crawl_targets SET status = 'done', last_http_status = 200, last_error = NULL,
       next_attempt_at = NULL, updated_at = UTC_TIMESTAMP() WHERE entity_type = ? AND slug = ?`,
      [parsed.profile.entityType, parsed.profile.slug]
    );

    await connection.commit();
    return { entityId: currentEntityId, shipmentCount: parsed.shipments.length, relationCount: parsed.relations.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function seedTargets(values, discoveredFromEntityId = null, depth = 0) {
  if (!values.length) return 0;
  const connection = await getPool().getConnection();
  try {
    const uniqueTargets = new Map();
    for (const value of values) {
      const target = parseProfileUrl(value);
      uniqueTargets.set(`${target.entityType}/${target.slug}`, target);
    }
    const targets = [...uniqueTargets.values()];
    for (let start = 0; start < targets.length; start += 200) {
      const chunk = targets.slice(start, start + 200);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, 'pending')").join(',');
      const params = chunk.flatMap(target => [target.entityType, target.slug, target.url, depth, discoveredFromEntityId]);
      await connection.execute(
        `INSERT INTO iy_crawl_targets (entity_type, slug, url, depth, discovered_from_entity_id, status)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           depth = IF(status IN ('pending', 'failed'), LEAST(depth, VALUES(depth)), depth),
           discovered_from_entity_id = IF(status IN ('pending', 'failed'), COALESCE(discovered_from_entity_id, VALUES(discovered_from_entity_id)), discovered_from_entity_id)`,
        params
      );
    }
    return uniqueTargets.size;
  } finally {
    connection.release();
  }
}

async function markTarget(target, status, error, httpStatus = null, retryDelayMs = 0) {
  await getPool().execute(
    `UPDATE iy_crawl_targets SET status = ?, attempts = attempts + 1, last_http_status = ?, last_error = ?,
      next_attempt_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
    [status, httpStatus, error ? String(error).slice(0, 4000) : null,
      retryDelayMs ? new Date(Date.now() + retryDelayMs) : null, target.id]
  );
}

async function claimNextTarget(statuses, maxDepth, attemptedIds = []) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, entity_type, slug, url, depth, attempts FROM iy_crawl_targets
       WHERE status IN (${statuses.map(() => '?').join(',')}) AND depth <= ?
         AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP())
         ${attemptedIds.length ? `AND id NOT IN (${attemptedIds.map(() => '?').join(',')})` : ''}
       ORDER BY depth ASC, id ASC LIMIT 1 FOR UPDATE`,
      [...statuses, maxDepth, ...attemptedIds]
    );
    if (!rows.length) {
      await connection.commit();
      return null;
    }
    const target = rows[0];
    await connection.execute("UPDATE iy_crawl_targets SET status = 'processing', updated_at = UTC_TIMESTAMP() WHERE id = ?", [target.id]);
    await connection.commit();
    return target;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function crawl({ maxTargets = 200, maxDepth = 2, delayMs, retryFailed = false, retryBlocked = false, returnSummary = false } = {}) {
  const config = getCrawlerConfig();
  if (Number.isFinite(delayMs)) config.delayMs = Math.max(2000, delayMs);
  const rules = await getRobotsRules(BASE_URL, config.userAgent);
  await getPool().execute(
    `UPDATE iy_crawl_targets SET status = 'pending', last_error = 'Recovered stale processing target after interrupted run.',
     updated_at = UTC_TIMESTAMP() WHERE status = 'processing' AND updated_at < UTC_TIMESTAMP() - INTERVAL 30 MINUTE`
  );
  const statuses = ['pending'];
  if (retryFailed) statuses.push('failed');
  if (retryBlocked) statuses.push('blocked');
  let completed = 0;
  const attemptedIds = [];
  const summary = { processed: 0, succeeded: 0, failed: 0, retryScheduled: 0, blocked: 0, stopReason: null };

  while (completed < maxTargets) {
    const target = await claimNextTarget(statuses, maxDepth, attemptedIds);
    if (!target) break;
    attemptedIds.push(target.id);
    const parsedTarget = parseProfileUrl(target.url);

    if (!isAllowedByRobots(parsedTarget.url, rules)) {
      await markTarget(target, 'blocked', 'Blocked by the current robots.txt rules.', 403);
      summary.blocked += 1;
      summary.stopReason = `robots.txt 禁止抓取 ${parsedTarget.url}`;
      console.warn(`Robots.txt disallows ${parsedTarget.url}; stopping.`);
      break;
    }

    console.log(`[${completed + 1}/${maxTargets}] ${parsedTarget.entityType}/${parsedTarget.slug}`);

    try {
      const { html, finalUrl } = await fetchPage(parsedTarget.url, config);
      if (!isAllowedByRobots(finalUrl, rules)) {
        const error = new Error('Redirect destination is disallowed by robots.txt.');
        error.blocked = true;
        throw error;
      }
      const parsed = parseProfile(html, finalUrl);
      const saved = await saveProfile(parsed, html, config);
      const nextDepth = Number(target.depth) + 1;
      if (nextDepth <= maxDepth) {
        const discovered = parsed.relations.map(relation => relation.url);
        await seedTargets(discovered, saved.entityId, nextDepth);
      }
      console.log(`  saved ${saved.shipmentCount} visible shipment rows, ${saved.relationCount} profile links`);
      summary.succeeded += 1;
      completed += 1;
    } catch (error) {
      const statusCode = error.statusCode || error.response?.status || null;
      if (error.blocked || [403, 429].includes(statusCode)) {
        await markTarget(target, 'blocked', error.message, statusCode);
        summary.blocked += 1;
        summary.stopReason = error.message;
        console.warn(`  paused: ${error.message}`);
        break;
      }
      const attempts = Number(target.attempts || 0) + 1;
      const canRetry = attempts < 3;
      await markTarget(target, canRetry ? 'pending' : 'failed', error.message, statusCode, canRetry ? attempts * 60000 : 0);
      summary.failed += 1;
      if (canRetry) summary.retryScheduled += 1;
      console.error(`  ${canRetry ? 'retry scheduled' : 'failed'}: ${error.message}`);
      completed += 1;
    }

    if (completed < maxTargets) await sleep(config.delayMs);
  }
  console.log(`Crawl finished. Processed ${completed} target(s).`);
  summary.processed = completed;
  return returnSummary ? summary : completed;
}

async function seedFromFile(filePath) {
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const urls = content.split(/\r?\n/).flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const value = trimmed.split(',').map(part => part.trim().replace(/^"|"$/g, '')).find(part => /^(https?:\/\/|\/)(www\.)?importyeti\.com|^\/((company|supplier)\/)/i.test(part));
    return value ? [value] : [];
  });
  return seedTargets(urls);
}

async function showStatus() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('iy_crawl_targets', 'iy_entities', 'iy_shipments')`
  );
  const estimate = Object.fromEntries(rows.map(row => [row.TABLE_NAME, Number(row.TABLE_ROWS) || 0]));
  console.log(JSON.stringify({
    approximate: true,
    targets: estimate.iy_crawl_targets || 0,
    entities: estimate.iy_entities || 0,
    shipments: estimate.iy_shipments || 0,
  }, null, 2));
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function exportShipments(outputPath) {
  const fs = require('fs');
  const path = require('path');
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const columns = [
    'bol_number', 'master_bol_number', 'arrival_date', 'company_name', 'supplier_name', 'supplier_country',
    'entry_port', 'exit_port', 'weight_value', 'weight_unit', 'quantity_value', 'quantity_unit',
    'container_count', 'product_description', 'source_url',
  ];
  const stream = fs.createWriteStream(resolved, { encoding: 'utf8' });
  const write = chunk => new Promise((resolve, reject) => {
    stream.write(chunk, error => error ? reject(error) : resolve());
  });
  let lastId = 0;
  let exported = 0;
  const pool = getPool();
  try {
    const [[{ maxId }]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM iy_shipments');
    await write(`\uFEFF${columns.join(',')}\n`);
    while (true) {
      const [rows] = await pool.execute(
        `SELECT s.id, s.bol_number, s.master_bol_number, s.arrival_date, c.name AS company_name,
          p.name AS supplier_name, s.supplier_country, s.entry_port, s.exit_port,
          s.weight_value, s.weight_unit, s.quantity_value, s.quantity_unit, s.container_count,
          s.product_description, s.source_url
         FROM iy_shipments s
         LEFT JOIN iy_entities c ON c.id = s.company_entity_id
         LEFT JOIN iy_entities p ON p.id = s.supplier_entity_id
         WHERE s.id > ? AND s.id <= ? ORDER BY s.id ASC LIMIT 1000`,
        [lastId, maxId]
      );
      if (!rows.length) break;
      const csv = rows.map(row => columns.map(column => csvCell(row[column])).join(',')).join('\n');
      await write(`${csv}\n`);
      lastId = Number(rows[rows.length - 1].id);
      exported += rows.length;
    }
  } catch (error) {
    stream.destroy();
    throw error;
  }
  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
  console.log(`Exported ${exported} rows to ${resolved} using 1000-row keyset batches.`);
}

module.exports = { crawl, seedTargets, seedFromFile, showStatus, exportShipments, getCrawlerConfig };
