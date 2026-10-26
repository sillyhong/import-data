const fs = require('fs');
const path = require('path');

const SOURCES = new Set(['importgenius', 'importyeti']);
const DATABASE_FIELDS = ['HOST', 'PORT', 'USER', 'PASSWORD', 'NAME'];
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function getTaskEnvironment(environment = process.env.TASK_ENV) {
  if (!['local', 'production'].includes(environment)) {
    throw new Error('TASK_ENV must be explicitly set to local or production.');
  }
  return environment;
}

function sourceDetails(source, environment) {
  if (!SOURCES.has(source)) throw new Error('Unsupported data source configuration.');
  const currentEnvironment = getTaskEnvironment(environment);
  const prefix = `${source.toUpperCase()}_`;
  return {
    prefix,
    sourceLabel: source === 'importgenius' ? 'ImportGenius' : 'ImportYeti',
    environment: currentEnvironment,
    databasePrefix: `${prefix}${currentEnvironment === 'production' ? 'PRODUCTION' : 'LOCAL'}_DB_`,
    filePath: path.join(__dirname, `${currentEnvironment === 'production' ? '.prod' : '.env'}.${source}`),
  };
}

function parseEnvironmentFile(content, filePath) {
  const values = Object.create(null);
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      let closing = -1;
      let backslashes = 0;
      for (let cursor = 1; cursor < value.length; cursor += 1) {
        const character = value[cursor];
        if (character === quote && backslashes % 2 === 0) {
          closing = cursor;
          break;
        }
        backslashes = character === '\\' ? backslashes + 1 : 0;
      }
      const trailing = closing < 0 ? '' : value.slice(closing + 1).trim();
      if (closing < 0 || (trailing && !trailing.startsWith('#'))) {
        throw new Error(`Invalid environment syntax in ${filePath} at line ${index + 1}.`);
      }
      // Quotes delimit the value; their contents remain literal, including $, # and backslashes.
      values[key] = value.slice(1, closing);
    } else {
      const comment = value.startsWith('#') ? 0 : value.search(/\s+#/);
      values[key] = (comment < 0 ? value : value.slice(0, comment)).trimEnd();
    }
  }
  return values;
}

function readSelectedFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return Object.create(null);
    throw new Error(`Cannot read configuration file ${filePath} (${error.code || 'read error'}).`);
  }
  return parseEnvironmentFile(content, filePath);
}

function isDatabaseAlias(key, prefix) {
  if (key.startsWith(`${prefix}LOCAL_DB_`) || key.startsWith(`${prefix}PRODUCTION_DB_`)) return true;
  return DATABASE_FIELDS.some(field => key === `${prefix}DB_${field}`);
}

function loadDataSourceConfig(source, environment = process.env.TASK_ENV) {
  const details = sourceDetails(source, environment);
  const selected = readSelectedFile(details.filePath);
  const merged = Object.create(null);

  for (const field of DATABASE_FIELDS) {
    const canonicalKey = `${details.databasePrefix}${field}`;
    if (hasOwn(process.env, canonicalKey)) {
      // An explicitly empty variable is still an override, especially for PASSWORD.
      merged[canonicalKey] = process.env[canonicalKey];
      continue;
    }
    const aliases = details.environment === 'production'
      ? [canonicalKey, `${details.prefix}DB_${field}`, `${details.prefix}LOCAL_DB_${field}`]
      : [canonicalKey, `${details.prefix}DB_${field}`];
    const selectedKey = aliases.find(key => hasOwn(selected, key));
    if (selectedKey !== undefined) merged[canonicalKey] = selected[selectedKey];
  }

  // Read tuning only from this source and this environment's selected file.
  // Never publish aliases or file-derived values to process.env across environment changes.
  for (const key of new Set([...Object.keys(selected), ...Object.keys(process.env)])) {
    if (!key.startsWith(details.prefix) || isDatabaseAlias(key, details.prefix)) continue;
    if (hasOwn(process.env, key)) merged[key] = process.env[key];
    else merged[key] = selected[key];
  }
  return merged;
}

function getDatabaseSettings(source, environment = process.env.TASK_ENV) {
  const details = sourceDetails(source, environment);
  const config = loadDataSourceConfig(source, details.environment);
  const keyFor = field => `${details.databasePrefix}${field}`;
  const missing = ['HOST', 'USER', 'NAME'].filter(field => {
    const value = config[keyFor(field)];
    return typeof value !== 'string' || !value.trim();
  });
  if (missing.length) {
    throw new Error(`Missing ${details.environment} ${details.sourceLabel} database settings: ${missing.map(keyFor).join(', ')}. Selected configuration file: ${details.filePath}.`);
  }
  const portValue = config[keyFor('PORT')];
  const portText = portValue === undefined || portValue === '' ? '3306' : String(portValue);
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid database setting ${keyFor('PORT')}: expected an integer from 1 to 65535. Selected configuration file: ${details.filePath}.`);
  }
  return {
    host: config[keyFor('HOST')],
    port,
    user: config[keyFor('USER')],
    password: config[keyFor('PASSWORD')] ?? '',
    database: config[keyFor('NAME')],
  };
}

function getDataSourceOption(source, key, fallback, environment = process.env.TASK_ENV) {
  const details = sourceDetails(source, environment);
  if (typeof key !== 'string' || !key.startsWith(details.prefix) || !/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw new Error('The configuration option must use the selected data source prefix.');
  }
  const config = loadDataSourceConfig(source, details.environment);
  return hasOwn(config, key) ? config[key] : fallback;
}

function loadServerEnvironment(environment = process.env.TASK_ENV) {
  // TASK_ENV is selected by the startup command, never by a data-source file.
  // Existing process variables, including an explicit empty token, take precedence.
  if (environment !== 'production' || hasOwn(process.env, 'TASK_CONTROL_TOKEN')) return;
  const { filePath } = sourceDetails('importgenius', environment);
  const selected = readSelectedFile(filePath);
  if (hasOwn(selected, 'TASK_CONTROL_TOKEN')) {
    process.env.TASK_CONTROL_TOKEN = selected.TASK_CONTROL_TOKEN;
  }
}

module.exports = { loadDataSourceConfig, getDatabaseSettings, getTaskEnvironment, getDataSourceOption, loadServerEnvironment };
