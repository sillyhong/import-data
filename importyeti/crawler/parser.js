const crypto = require('crypto');

const BASE_URL = 'https://www.importyeti.com';

function cleanText(value) {
  return String(value || '')
    .replace(/[\u200b-\u200d\ufeff\u2060\u00ad]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseProfileUrl(value) {
  const input = String(value || '').trim();
  const candidate = input.startsWith('/') ? new URL(input, BASE_URL) : new URL(input);
  if (!['www.importyeti.com', 'importyeti.com'].includes(candidate.hostname.toLowerCase())) {
    throw new Error(`Only ImportYeti profile URLs are accepted: ${input}`);
  }
  const match = candidate.pathname.match(/^\/(company|supplier)\/([a-z0-9][a-z0-9-]*)\/?$/i);
  if (!match) throw new Error(`Expected a /company/<slug> or /supplier/<slug> profile URL: ${input}`);
  const entityType = match[1].toLowerCase();
  const slug = match[2].toLowerCase();
  return {
    entityType,
    slug,
    url: `${BASE_URL}/${entityType}/${slug}`,
  };
}

function parseNumber(value) {
  const match = cleanText(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseDate(value) {
  const text = cleanText(value);
  let match = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (match) {
    const [, month, day, year] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  match = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() !== Number(match[2]) - 1 || parsed.getUTCDate() !== Number(match[3])) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getCells($, row) {
  return $(row).find('th,td').toArray().map(cell => cleanText($(cell).text()));
}

function getHeaderIndex(headers, predicate) {
  return headers.findIndex(header => predicate(normalizeHeader(header)));
}

function getTableRows($, table) {
  const rows = $(table).find('tr').toArray();
  if (rows.length < 2) return null;
  const headerIndex = rows.findIndex(row => $(row).find('th').length > 0);
  const index = headerIndex < 0 ? 0 : headerIndex;
  const headers = getCells($, rows[index]);
  return { headers, rows: rows.slice(index + 1) };
}

function tableRecords($, isShipmentTable) {
  const records = [];
  $('table').each((_, table) => {
    const parsed = getTableRows($, table);
    if (!parsed) return;
    const headers = parsed.headers;
    const normalized = headers.map(normalizeHeader);
    if (!isShipmentTable(normalized)) return;

    for (const row of parsed.rows) {
      const values = getCells($, row);
      if (!values.some(Boolean)) continue;
      const raw = {};
      headers.forEach((header, index) => {
        if (header) raw[header] = values[index] || '';
      });
      records.push({ headers, values, raw, row });
    }
  });
  return records;
}

function collectShipments($, sourceUrl, currentEntityType) {
  const rows = tableRecords($, headers =>
    headers.some(value => value.includes('bill of lading')) &&
    headers.some(value => value === 'date' || value.includes('arrival'))
  );

  return rows.map(({ headers, values, raw, row }) => {
    const dateIndex = getHeaderIndex(headers, value => value === 'date' || value.includes('arrival'));
    const bolIndex = getHeaderIndex(headers, value => value.includes('bill of lading'));
    const countryIndex = getHeaderIndex(headers, value => value.includes('supplier country') || value === 'country');
    const weightIndex = getHeaderIndex(headers, value => value.includes('weight'));
    const quantityIndex = getHeaderIndex(headers, value => value.includes('quantity'));
    const containersIndex = getHeaderIndex(headers, value => value.includes('container'));
    const descriptionIndex = getHeaderIndex(headers, value => value.includes('description') || value.includes('product'));
    const entryPortIndex = getHeaderIndex(headers, value => value.includes('entry port') || value === 'port of entry');
    const exitPortIndex = getHeaderIndex(headers, value => value.includes('exit port') || value === 'port of exit');
    const cells = $(row).find('td,th').toArray();
    const cellText = index => index >= 0 ? values[index] || '' : '';
    const cell = index => index >= 0 ? cells[index] : null;
    const bolText = cellText(bolIndex);
    const bolLinkText = cell(bolIndex) ? cleanText($(cell(bolIndex)).find('a').first().text()) : '';
    const bolMatches = `${bolLinkText} ${bolText}`.match(/\b[A-Z0-9]{8,}\b/gi) || [];
    const quantityText = cellText(quantityIndex);
    const weightText = cellText(weightIndex);
    const containerText = cellText(containersIndex);
    const description = cellText(descriptionIndex);
    const profileLink = $(row).find('a[href]').toArray().map(anchor => {
      try {
        return parseProfileUrl(new URL($(anchor).attr('href'), BASE_URL).href);
      } catch (_) {
        return null;
      }
    }).find(link => link && link.entityType !== currentEntityType);
    const counterpartyName = profileLink
      ? cleanText($(row).find(`a[href*="/${profileLink.entityType}/${profileLink.slug}"]`).first().text()) || profileLink.slug
      : null;
    const countryText = cellText(countryIndex);
    const supplierCountry = profileLink?.entityType === 'supplier'
      ? cleanText(countryText.replace(counterpartyName, '')) || countryText || null
      : countryText || null;
    const hsCodes = [...new Set([...description.matchAll(/\b(?:HS|HTS)(?:\s+Code)?\s*[:#-]?\s*(\d{4,10}(?:\.\d{2,4})?)/gi)].map(match => match[1]))];

    return {
      bolNumber: bolMatches[0] ? bolMatches[0].toUpperCase() : null,
      masterBolNumber: bolMatches[1] ? bolMatches[1].toUpperCase() : null,
      arrivalDate: parseDate(cellText(dateIndex)),
      counterpartyType: profileLink?.entityType || null,
      counterpartySlug: profileLink?.slug || null,
      counterpartyName,
      supplierName: profileLink?.entityType === 'supplier' ? counterpartyName : null,
      companyName: profileLink?.entityType === 'company' ? counterpartyName : null,
      supplierCountry,
      entryPort: cellText(entryPortIndex) || null,
      exitPort: cellText(exitPortIndex) || null,
      weightValue: parseNumber(weightText),
      weightUnit: weightText.match(/\b(kg|kgs|lb|lbs)\b/i)?.[1]?.toLowerCase() || null,
      quantityValue: parseNumber(quantityText),
      quantityUnit: quantityText.match(/[a-z]{2,8}\b/i)?.[0]?.toLowerCase() || null,
      containerCount: parseNumber(containerText),
      productDescription: description || null,
      hsCodes,
      sourceUrl,
      raw,
    };
  }).filter(shipment => shipment.bolNumber || shipment.productDescription || shipment.arrivalDate);
}

function collectEntityLinks($, current) {
  const links = new Map();
  $('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href');
    if (!href) return;
    let parsed;
    try {
      parsed = parseProfileUrl(new URL(href, BASE_URL).href);
    } catch (_) {
      return;
    }
    if (parsed.entityType === current.entityType && parsed.slug === current.slug) return;

    const row = $(anchor).closest('tr');
    const rowText = cleanText(row.text());
    const tableRows = row.length ? getTableRows($, row.closest('table')) : null;
    const shipmentIndex = tableRows
      ? getHeaderIndex(tableRows.headers, header => header.includes('shipment'))
      : -1;
    const rowCells = row.length ? getCells($, row) : [];
    const relation = {
      ...parsed,
      name: cleanText($(anchor).text()) || parsed.slug,
      url: parsed.url,
      shipmentCount: shipmentIndex >= 0 ? parseNumber(rowCells[shipmentIndex]) : null,
      rowText: rowText || cleanText($(anchor).parent().text()),
    };
    links.set(`${parsed.entityType}/${parsed.slug}`, relation);
  });
  return [...links.values()];
}

function collectHtsCodes($) {
  const records = tableRecords($, headers => headers.some(value => value.includes('hts code') || value === 'hs code'));
  const codes = new Map();
  for (const { headers, values, row } of records) {
    const codeIndex = getHeaderIndex(headers, value => value.includes('hts code') || value === 'hs code');
    const descriptionIndex = getHeaderIndex(headers, value => value.includes('description'));
    const shipmentsIndex = getHeaderIndex(headers, value => value.includes('shipments'));
    const bolIndex = getHeaderIndex(headers, value => value.includes('bill of lading') || value.includes('bol number'));
    const productDescriptionIndex = getHeaderIndex(headers, value => value.includes('product description'));
    const code = cleanText(values[codeIndex]);
    if (!code || !/\d/.test(code)) continue;
    const bolCell = bolIndex >= 0 ? $(row).find('td,th').eq(bolIndex) : null;
    const bolText = bolIndex >= 0 ? `${values[bolIndex] || ''} ${bolCell?.find('a').text() || ''}` : '';
    const bolNumbers = [...new Set((bolText.match(/\b[A-Z0-9]{8,}\b/gi) || []).map(value => value.toUpperCase()))];
    const current = codes.get(code) || {
      code,
      description: values[descriptionIndex] || null,
      shipmentCount: parseNumber(values[shipmentsIndex]),
      bolNumbers: [],
      productDescription: null,
    };
    current.bolNumbers = [...new Set([...current.bolNumbers, ...bolNumbers])];
    current.productDescription = current.productDescription || cleanText(values[productDescriptionIndex]) || null;
    codes.set(code, current);
  }
  return [...codes.values()];
}

function collectCountryStats($) {
  const stats = [];
  $('table').each((_, table) => {
    const parsed = getTableRows($, table);
    if (!parsed) return;
    const countryIndex = getHeaderIndex(parsed.headers, header => header === 'country' || header.includes('country'));
    const shipmentsIndex = getHeaderIndex(parsed.headers, header => header.includes('shipment'));
    if (countryIndex < 0 || shipmentsIndex < 0) return;

    for (const row of parsed.rows) {
      const values = getCells($, row);
      const countryName = cleanText(values[countryIndex]);
      const shipmentCount = parseNumber(values[shipmentsIndex]);
      if (countryName && shipmentCount !== null) stats.push({ regionName: '', countryName, shipmentCount });
    }
  });

  return [...new Map(stats.map(stat => [stat.countryName.toLowerCase(), stat])).values()];
}

function inferSupplierCountry(address, countryStats) {
  const normalizedAddress = cleanText(address).toLowerCase();
  if (!normalizedAddress) return null;
  return [...countryStats]
    .sort((left, right) => right.countryName.length - left.countryName.length)
    .find(({ countryName }) => {
      const escaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`, 'i').test(normalizedAddress);
    })?.countryName || null;
}

function detectChallenge($, html) {
  const title = cleanText($('title').first().text()).toLowerCase();
  const body = cleanText($('body').text()).toLowerCase();
  return title.includes('just a moment') || body.includes('verify you are human') || body.includes('checking your browser') || html.includes('cf-chl-');
}

function parseProfile(html, sourceUrl) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  if (detectChallenge($, html)) {
    const error = new Error('The site returned an anti-bot challenge. The crawler stopped without attempting to bypass it.');
    error.blocked = true;
    error.statusCode = 403;
    throw error;
  }

  const current = parseProfileUrl(sourceUrl);
  const documentTitle = cleanText($('title').first().text());
  const h1 = cleanText($('h1').first().text()).replace(/\s+(company|supplier)$/i, '');
  const titleName = documentTitle.split(' - ')[0];
  const name = h1 || titleName || current.slug;
  const titleParts = documentTitle.split(' - ');
  const address = titleParts.length > 1 && !/^(company|supplier) report$/i.test(titleParts[1]) ? titleParts[1] : null;
  const bodyText = cleanText($('body').text());
  const totalMatch = bodyText.match(/Total Sea Shipments\s*([\d,]+)/i);
  const countryMatch = address && address.match(/,\s*([A-Z]{2})\s*$/i);
  const websiteAnchor = $('a[href]').toArray().map(anchor => $(anchor).attr('href')).find(href => {
    try {
      const url = new URL(href);
      return /^https?:$/.test(url.protocol) && !['www.importyeti.com', 'importyeti.com'].includes(url.hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  });

  const htsCodes = collectHtsCodes($);
  const countryStats = collectCountryStats($);
  const shipments = collectShipments($, sourceUrl, current.entityType);
  const supplierCountry = current.entityType === 'supplier' ? inferSupplierCountry(address, countryStats) : null;
  const htsCodesByBol = new Map();
  for (const record of htsCodes) {
    for (const bolNumber of record.bolNumbers) {
      const match = htsCodesByBol.get(bolNumber) || { codes: [], productDescriptions: [] };
      match.codes.push(record.code);
      if (record.productDescription) match.productDescriptions.push(record.productDescription);
      htsCodesByBol.set(bolNumber, match);
    }
  }
  for (const shipment of shipments) {
    if (!shipment.supplierCountry && supplierCountry) shipment.supplierCountry = supplierCountry;
    const htsMatch = htsCodesByBol.get(shipment.bolNumber);
    if (!htsMatch) continue;
    shipment.hsCodes = [...new Set([...shipment.hsCodes, ...htsMatch.codes])];
    if (!shipment.productDescription) shipment.productDescription = htsMatch.productDescriptions.find(Boolean) || null;
  }
  const relations = collectEntityLinks($, current);
  if (!h1 && !totalMatch && !shipments.length && !htsCodes.length && !countryStats.length) {
    throw new Error('The response did not contain recognizable ImportYeti profile data.');
  }
  const lastShipment = bodyText.match(/Last Shipment Spotted\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const profile = {
    entityType: current.entityType,
    slug: current.slug,
    name,
    address,
    countryCode: countryMatch ? countryMatch[1].toUpperCase() : null,
    supplierCountry,
    website: websiteAnchor || null,
    totalShipments: totalMatch ? parseNumber(totalMatch[1]) : null,
    mostRecentShipment: lastShipment ? parseDate(lastShipment[1]) : null,
    htsCodes,
    countryStats,
    relationCount: relations.length,
    shipmentCount: shipments.length,
    sourceUrl,
  };
  return { profile, shipments, relations, htsCodes, countryStats };
}

function hashRecord(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

module.exports = { parseProfileUrl, parseProfile, parseDate, parseNumber, hashRecord, cleanText };
