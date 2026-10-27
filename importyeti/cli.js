#!/usr/bin/env node

const path = require('path');
const { initializeSchema, closePool } = require('./database/db');
const { getDataSourceOption, getTaskEnvironment } = require('../config/environment');
const { parseProfileUrl } = require('./crawler/parser');
const { crawl, seedTargets, seedFromFile, showStatus, exportShipments } = require('./crawler/crawler');
const { enrichFromImportInfo, parseImportInfoProfileUrl } = require('./enrichment/importinfo');

function printHelp() {
  console.log(`ImportYeti public-profile collector (MySQL)

Commands:
  init                                  Create the iy_* MySQL tables
  seed <profile-url...>                 Add company/supplier profile URLs
  seed --file <path>                    Read profile URLs from a text/CSV file
  crawl [options]                       Crawl public profiles and discover linked entities
  full-sync [options]                   Initialize tables, refresh due profiles, crawl and report status
  enrich-importinfo <profile-url>       Fill matched shipment details from a public ImportInfo profile
  status                                Show queue and storage counts
  export [--out <path>]                 Export shipments as CSV

Crawl options:
  --max-targets <n>   Maximum profiles in this run (default: 200)
  --max-depth <n>     Relation expansion depth (default: 2)
  --delay-ms <n>     Request interval, minimum 2000 ms (default: 3000)
  --retry-failed      Also retry failed targets
  --retry-blocked     Retry targets previously blocked by robots/HTTP/challenge
  --no-retry-failed   full-sync only: leave previously failed targets untouched

Examples:
  npm run importyeti:init
  npm run importyeti -- seed https://www.importyeti.com/company/wal-mart
  npm run importyeti -- seed --file targets.csv
  npm run importyeti:crawl -- --max-targets 100 --max-depth 1
  npm run importyeti:production -- full-sync --max-targets 100 --max-depth 2
  npm run importyeti:enrich-importinfo -- https://www.importinfo.com/gemtek-vietnam-corporation-limited
  npm run importyeti:export -- --out exports/importyeti.csv
  npm run importyeti:production -- status

TASK_ENV=local uses config/.env.importyeti; TASK_ENV=production uses config/.prod.importyeti.
Set TASK_ENV explicitly when running node importyeti/cli.js directly. The npm commands select their environment.
MySQL and crawler options are read from the selected config file or matching environment variables.
Only public /company/ and /supplier/ profiles are fetched.
The collector checks robots.txt and pauses on HTTP 403/429 or an anti-bot challenge.`);
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function integerOption(args, name, fallback, minimum) {
  const value = Number(optionValue(args, name, fallback));
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help' || args.includes('--help') || args.includes('-h')) return printHelp();
  getTaskEnvironment();

  if (command === 'init') {
    const indexes = await initializeSchema();
    console.log('MySQL schema and performance indexes are ready.');
    console.log(JSON.stringify(indexes, null, 2));
    return;
  }
  if (command === 'seed') {
    const fileIndex = args.indexOf('--file');
    let count;
    if (fileIndex >= 0) {
      const filePath = args[fileIndex + 1];
      if (!filePath) throw new Error('Provide a path after --file.');
      count = await seedFromFile(path.resolve(filePath));
    } else {
      const urls = args.filter(value => !value.startsWith('--'));
      if (!urls.length) throw new Error('Provide one or more ImportYeti profile URLs, or use --file.');
      urls.forEach(parseProfileUrl);
      count = await seedTargets(urls);
    }
    console.log(`Queued ${count} new profile target(s).`);
    return;
  }
  if (command === 'crawl') {
    await crawl({
      maxTargets: integerOption(args, '--max-targets', 200, 1),
      maxDepth: integerOption(args, '--max-depth', 2, 0),
      delayMs: integerOption(args, '--delay-ms', getDataSourceOption('importyeti', 'IMPORTYETI_DELAY_MS', 3000), 2000),
      retryFailed: args.includes('--retry-failed'),
      retryBlocked: args.includes('--retry-blocked'),
    });
    return;
  }
  if (command === 'full-sync') {
    const { runFullSync } = require('./workflows/fullSync');
    await runFullSync({
      maxTargets: integerOption(args, '--max-targets', 100, 1),
      maxDepth: integerOption(args, '--max-depth', 2, 0),
      delayMs: integerOption(args, '--delay-ms', getDataSourceOption('importyeti', 'IMPORTYETI_DELAY_MS', 3000), 2000),
      retryFailed: !args.includes('--no-retry-failed'),
      retryBlocked: args.includes('--retry-blocked'),
    });
    return;
  }
  if (command === 'enrich-importinfo') {
    const profileUrl = args.find(value => !value.startsWith('--'));
    if (!profileUrl) throw new Error('Provide a public ImportInfo company profile URL.');
    await enrichFromImportInfo(parseImportInfoProfileUrl(profileUrl));
    return;
  }
  if (command === 'status') return showStatus();
  if (command === 'export') return exportShipments(optionValue(args, '--out', 'exports/importyeti-shipments.csv'));

  printHelp();
  throw new Error(`Unknown command: ${command}`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
