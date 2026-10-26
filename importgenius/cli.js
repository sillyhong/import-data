#!/usr/bin/env node

const { getTaskEnvironment } = require('../config/environment');

function parsePages(value) {
  if (!value) return [];
  const pages = [];
  for (const part of value.split(',').map(piece => piece.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`无效页码表达式：${part}。示例：--pages 1-10,15`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 999) {
      throw new Error(`页码范围无效或过大：${part}。单段最多 1000 页。`);
    }
    for (let page = start; page <= end; page += 1) pages.push(page);
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

function parseOptions(args) {
  const options = { country: 'usa', pages: [], refresh: false, batchId: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--refresh') options.refresh = true;
    else if (arg === '--cleanup') throw new Error('批次快照需保留历史，不再支持 --cleanup。');
    else if (arg === '--country' || arg === '--pages' || arg === '--batch') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少值。`);
      if (arg === '--country') options.country = value.toLowerCase();
      else if (arg === '--pages') options.pages = parsePages(value);
      else options.batchId = require('./storage/batches').validateBatchId(value);
      index += 1;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (options.refresh && options.batchId) throw new Error('--batch 表示续跑原批次，不能与 --refresh 一起使用；刷新数据请省略 --batch 新建采集。');
  return options;
}

function printHelp() {
  console.log(`ImportGenius 采集与入库命令

  npm run importgenius:sync:dev -- --country usa --pages 1-10
  npm run importgenius:sync:dev -- --country usa --batch 20261026/103025-a7f3abcd

选项：
  --country <国家代码>  默认 usa
  --pages <页码>        新采集必须提供；续跑缺省使用批次的全部页码
  --batch <采集批次>    续跑已有 YYYYMMDD/HHmmss-8位标识批次；legacy 读取旧平铺 JSON
  --refresh             兼容旧命令，表示新建采集；不能与 --batch 同用

省略 --batch 的 sync / fetch-importers 每次新建批次，同日执行互不覆盖。
fetch-shipments / import 必须指定 --batch；--pages 可选择该批次的部分页码。
批次目录：data/importer/<国家>/<上海日期>/<时间-标识>/；所有 JSON 保留。

单独运行某阶段：fetch-importers、fetch-shipments、import。
TASK_ENV=local 读取 config/.env.importgenius；TASK_ENV=production 读取 config/.prod.importgenius。
完整采集命令仅允许本地；生产完整采集请使用任务页面。`);
}

async function main(args = process.argv.slice(2)) {
  const command = args[0] || 'sync';
  if (['--help', '-h', 'help'].includes(command)) return printHelp();
  const options = parseOptions(args.slice(1));
  if (options.help) return printHelp();
  const environment = getTaskEnvironment();
  const country = options.country;
  const taskIds = {
    sync: 'importgenius.full-sync',
    'fetch-importers': 'importgenius.fetch-importers',
    'fetch-shipments': 'importgenius.fetch-shipments',
    import: 'importgenius.import-batch',
  };
  if (!taskIds[command]) throw new Error(`未知命令：${command}`);
  if (command === 'sync' && environment !== 'local') throw new Error('命令行完整采集仅允许 TASK_ENV=local；生产完整采集请使用任务页面。');
  if (['fetch-shipments', 'import'].includes(command) && !options.batchId) {
    throw new Error('请使用 --batch 选择采集批次（旧平铺 JSON 使用 --batch legacy）。');
  }
  if (options.batchId) {
    const batch = await require('./storage/batches').openBatch(country, options.batchId, {
      ...(options.pages.length ? { pages: options.pages } : {}),
    });
    options.pages = batch.pages;
  } else if (!options.pages.length) {
    throw new Error('新采集必须指定 --pages，避免误启动大范围抓取。');
  }

  let runner;
  try {
    runner = require('../server/task-runner');
    // This short-lived CLI process must not start its own production weekly scheduler.
    runner.setScheduler('stop');
    console.log(`[ImportGenius][任务] 通过 server/task-runner 启动 ${command}：${country} 页 ${options.pages.join(', ')}；${options.batchId ? `续跑批次 ${options.batchId}` : '新建采集批次'}。`);
    const started = await runner.runTask(taskIds[command], {
      country,
      pages: options.pages,
      ...(options.batchId ? { batchId: options.batchId } : {}),
    }, {
      onLog(stream, chunk) {
        (stream === 'stderr' ? process.stderr : process.stdout).write(chunk);
      },
    });
    const result = await runner.waitForRun(taskIds[command], started.runId);
    if (result.status !== 'success') {
      const batchId = result.batchId || result.params?.batchId || started.batchId || started.params?.batchId || options.batchId;
      let resumeMessage = '本次尚未创建可用采集批次，请重新新建采集。';
      if (batchId) {
        try {
          await require('./storage/batches').openBatch(country, batchId);
          resumeMessage = `批次 ${batchId} 保留，可使用 --batch ${batchId} 续跑。`;
        } catch (_) { /* The database preflight can fail before a batch directory is created. */ }
      }
      throw new Error(`task-runner 任务${result.status === 'failed' ? '失败' : `结束于 ${result.status}`}：${result.error || '请查看上方阶段日志。'} ${resumeMessage}`);
    }
    console.log(`[ImportGenius][任务] 完成：runId=${result.runId}，耗时 ${(result.durationMs / 1000).toFixed(1)} 秒。`);
  } finally {
    if (runner) runner.setScheduler('stop');
    await require('./database/db').closePool().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[ImportGenius][流程] 终止：${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parsePages, parseOptions, main };
