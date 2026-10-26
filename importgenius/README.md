# ImportGenius

## 目录说明

- `crawler/`：采集公司列表和货运记录。
- `analysis/`：本地 JSON 数据检查工具。
- `config/`：本数据源的爬虫关键词配置；数据库环境配置统一放在项目根目录 `config/`。
- `data/importer/<国家>/<上海日期>/<时间-批次标识>/`：每次采集独立保存的 JSON 页面与 `manifest.json` 进度清单；旧的 `<国家>/<页码>.json` 作为 `legacy` 历史数据兼容读取。
- `storage/batches.js`：批次创建、查询、路径校验、环境隔离和阶段进度管理。
- `database/db.js`：MySQL 连接、索引检查、搜索侧表回填和全文索引管理。
- `database/init.sql`：唯一的数据库初始化与升级 SQL 入口。
- `database/ingest/`：批量导入和命令行入库逻辑。
- `database/queries/`：可复用查询语句。
- `docs/legacy/`：历史爬虫分析文档，不代表当前运行逻辑。
- 项目根目录 `logs/tasks/`：手动任务与定时任务的持久化执行日志；旧 `logs/scheduler/` 历史仍可查询和清理。

## 环境配置

连接配置由 `TASK_ENV` 显式选择，均相对于项目根目录读取：

| 环境 | 配置文件 | 标准数据库前缀 |
| --- | --- | --- |
| local | `config/.env.importgenius` | `IMPORTGENIUS_LOCAL_DB_*` |
| production | `config/.prod.importgenius` | `IMPORTGENIUS_PRODUCTION_DB_*` |

已有文件直接维护，无需重建。新建本地配置时，按上表路径与前缀手动创建；新建生产配置可执行 `cp -n config/.prod.importgenius.example config/.prod.importgenius`，不会覆盖已有文件。填写 `HOST/PORT/USER/PASSWORD/NAME`，密码含 `#` 时使用引号。根目录旧 `.env.importgenius` 不再读取，启动目录不影响配置选择。

当前环境的外部标准变量优先于所选文件；所选文件内标准键优先于兼容的旧 `IMPORTGENIUS_DB_*` / `IMPORTGENIUS_LOCAL_DB_*` 键。生产不读取本地文件，也不从进程环境的 `*_LOCAL_DB_*` 回退。生产文件缺失时，完整的外部 `IMPORTGENIUS_PRODUCTION_DB_*` 配置仍可使用。读取配置不会批量修改 `process.env`；未知环境或缺少必要连接项会报错。详见项目根目录 [config/README.md](../config/README.md)。

本地 API 使用 `npm run server:dev`，生产使用 `npm run server`（脚本设置 `TASK_ENV=production`、`NODE_ENV=production`）。生产启动时会自动读取 `config/.prod.importgenius` 中的 `TASK_CONTROL_TOKEN`；填写足够长的随机令牌，页面生产操作确认时输入同值。本地不要求令牌。修改令牌后需重启 API；外部显式环境变量优先，包括显式空值。若此前终端 `export` 过令牌，可 `unset TASK_CONTROL_TOKEN` 后重启，让文件配置生效。

启动读取只允许令牌这一个键，不从 `.prod.importyeti` 读取令牌，也不会将数据库键、`TASK_ENV` 或 `NODE_ENV` 从文件加载到全局环境。`npm run start:all:dev` 和 `npm run start:all:prod` 可分别启动 React 开发服务器及对应环境 API，用于本机联调。生产 API 单实例运行，并自动启用周日 00:00（Asia/Shanghai）定时采集。

数据库配置修改后，重启后端或重新运行 CLI；已有连接池不会热切换到新数据库。

## 初始化数据库

SQL 默认创建并使用 `import_data`。进入项目根目录执行：

```bash
mysql -u your_mysql_user -p < importgenius/database/init.sql
```

将 `your_mysql_user` 替换为实际 MySQL 用户名。

如果目标环境数据库名称不同，请先把 `init.sql` 开头的 `import_data` 改成目标名称，再执行。首次运行会创建主表、常用查询索引、全文搜索侧表和回填状态表。

已有 `importgenius` 主表时，`CREATE TABLE IF NOT EXISTS` 不会重建主表或修改现有数据；初始化会新增可空的 `createdAt` 字段，旧记录的创建时间无法还原，因此保持 `NULL`，之后新写入的记录会自动记录创建时间。也可运行任务页的“盘点并补齐 ImportGenius 查询索引”完成字段和索引升级。搜索侧表的关联字段会读取当前主表 `id` 的实际类型，因此兼容旧库的 `INT`、`BIGINT` 等定义。

## 从旧库 dump 恢复

如果 Workbench 导出的 `.sql` 同时包含建表语句和数据：先导入到空的目标数据库，让 dump 恢复原始 `importgenius` 主表；再执行 `init.sql`，它会保留已有主表并创建搜索侧表与回填状态表。之后在任务页面运行“盘点并补齐索引”，回填搜索侧表并创建全文索引。

如果 dump 只有数据（INSERT），必须先用原库的 `CREATE TABLE` 定义创建主表，再导入数据，最后执行 `init.sql`。`init.sql` 不会把旧主表改成新结构。请先确认原表含有应用使用的字段；不要用猜测的字段类型替代原始表结构。

## 一键抓取与入库

列表页、公司详情页和 MySQL 入库按顺序执行。每次新采集创建独立批次，日期采用 Asia/Shanghai；同一天多次执行也不会覆盖前一次数据：

```text
data/importer/usa/
  20261026/
    103025-a7f3abcd/
      manifest.json
      1.json
      2.json
    160012-b8e2abcd/
      manifest.json
      1.json
```

`manifest.json` 记录批次标识、环境、来源、创建时间、页码以及列表/详情/入库各阶段的状态与时间。采集批次与每次任务运行 ID 独立：同一批次可以对应多次失败重试的运行日志。批次日期确定后不随午夜或续跑日期改变。

新建完整采集：

```bash
npm run importgenius:sync:dev -- --country usa --pages 1-10
```

页码可写成 `1,3,8` 或 `1-5,9`。完整流程先检查数据库连接，再为各国家建立同一批次标识的独立清单，逐页抓列表、补 shipments、事务入库。运行日志打印批次及文件目录，JSON 始终保留。

失败后必须选择**原批次**续跑，例如：

```bash
npm run importgenius:sync:dev -- --country usa --batch 20261026/103025-a7f3abcd

# 只续跑原批次中的部分页码
npm run importgenius:sync:dev -- --country usa --batch 20261026/103025-a7f3abcd --pages 1,2
```

省略 `--batch` 的列表/完整采集命令每次都创建新批次，不会自动猜测应续跑哪次历史任务。指定 `--batch` 且不传 `--pages` 时，CLI 使用原批次全部页码；显式指定的页码必须属于该批次。已成功保存的列表不再请求站点或被重写；详情只补缺失记录；完整流程会跳过清单中已成功入库的页面。已捕获列表文件若丢失或损坏，会报错要求恢复文件或新建批次，不把当前站点内容写回旧快照。

新批次不复制其他批次的 `shipments`，会重新采集当前详情，避免公司仍在列表中但新增提单一直未被抓取。批次日期表示采集归档时间；明天为今天的列表补详情时，取得的是明天执行请求时站点提供的数据，列表与详情分别记录阶段时间。动态排序期间跨页采集仍可能出现公司重复或遗漏，目录归档不代表站点提供了某一时刻的完整历史快照。

分阶段命令同样使用批次，详情和入库必须显式指定来源：

```bash
# 新建列表批次，记下日志中的批次 ID
npm run fetchImport -- --country usa --pages 1-10

# 为同一批次补详情、入库
npm run fetchShipments -- --country usa --batch 20261026/103025-a7f3abcd
npm run insertSql:batch:dev -- --country usa --batch 20261026/103025-a7f3abcd

# 旧版 <国家>/<页码>.json 不移动、不根据文件修改时间推断采集日期
npm run fetchShipments -- --country usa --batch legacy --pages 1,2
npm run insertSql:batch:dev -- --country usa --batch legacy --pages 1,2
```

旧 `--refresh` 仅保留为“新建采集”的兼容写法，不能与 `--batch` 同用；刷新数据应新建批次。`--cleanup` 已停用，避免删除需要保留的历史快照。批次不会自动清理。

任务页面 `/app/tasks` → ImportGenius 中，“新建采集/续跑已有批次”控制列表与完整流程；“已有采集批次”下拉显示时间、页码和各阶段进度，详情与入库始终绑定选中批次。页面单次最多选 20 页；历史批次页数更多时需明确填写子集。没有批次或批次尚未通过预检生成时，详情/入库不可执行。旧平铺文件显示为“历史未分批数据（legacy）”。新批次严格匹配当前后端环境，生产批次不能在本地环境续跑，反之亦然；legacy 没有可还原的环境记录。

数据库入库继续按公司 URL 匹配、按提单号追加合并，保持已有提单；重复入库不会重复追加同号提单。它不是完整字段差异同步：同号提单内容修正及没有新增提单的公司字段变化不会自动覆盖。新批次页面需补齐详情后再入库；搜索侧表存在时同步新增或合并记录的商品描述。

完整流程通过 `server/task-runner.js` 的 `importgenius.full-sync` worker 启动，与任务页面和定时器共用任务编排、实时日志、超时处理和 MySQL 分布式锁。命令行完整流程仅允许 `TASK_ENV=local`；生产流程仍由生产服务执行。

网络超时、连接重置、HTTP 408/5xx 和暂时性 MySQL 错误最多重试 3 次，并使用递增等待。HTTP 429 和 HTTP 567 每次响应都计入当前任务的累计限流/访问限制次数，包含同一地址的重试；列表和 shipment、不同页码和国家共用计数，成功请求不清零，新任务重新计数。前两次限制响应遵循 Retry-After（若有）和递增等待；第 3 次（超过允许的 2 次）立即终止任务，取消在途请求和重试等待，不再抓取后续数据或入库。限流日志包含抓取阶段、国家、列表页码或详情 URL、HTTP 状态和累计次数，终止时明确打印原因。

详情每个请求批组最多并发 2 家公司，当前批组全部完成后等待 5 秒再请求下一批组，成功结果会原子写回该采集批次 JSON。站点返回浏览器验证页（包括 HTTP 200 验证页）、HTTP 403，或累计 3 次 HTTP 429/567 时，会停止任务和完整流程。所有停止情形均保留已完成详情与 checkpoint；指定原 `--batch` 可续跑。页面诊断日志包含 HTTP 状态、页面标题、响应大小和最终地址，便于区分验证页与解析错误。其他单页失败最后汇总；401、页面结构变化和无效数据等非暂时错误不会反复重试同一请求。

周采集和手动完整流程使用同一 worker。每周日 00:00（Asia/Shanghai）生产环境自动新建批次，固定采集 13 个支持国家的第 1–10 页，各国家共用本轮批次 ID、分别保存进度；不读取手动表单参数。已有任务运行时本轮跳过。本地默认关闭定时器；手动开启后的计划范围为 usa 第 1–10 页。周采集失败不会自动改写上一轮数据；可选择失败的国家和原批次续跑。

旧的 `fetchImport`、`fetchShipments`、`insertSql:dev` 阶段命令仍保留用于单独排查；正常采集使用上面的一键命令即可。

批次改造的自动检查使用临时目录、模拟站点响应及数据库事务，不改已有采集文件或业务数据：

```bash
TASK_ENV=local node --test importgenius/cli.test.js importgenius/storage/*.test.js importgenius/crawler/*.test.js importgenius/workflows/*.test.js server/task-runner.test.js server/controller/tasks.test.js
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/TaskRunner.test.js
npm run build
```

覆盖同日多次采集、跨日续跑、列表不可覆盖、详情部分失败、数据库回滚后重试、多国家批次、旧数据兼容、环境/页码校验及页面批次选择。变更部署后需重启 API 载入批次接口与 worker；生产前端重新构建发布，开发前端刷新页面即可。批次接口不存在或响应无效时，页面禁用所有 ImportGenius 采集入口，避免新前端调用旧后端继续覆盖平铺 JSON；重启正确版本 API 后刷新恢复。

## 已有数据库升级与全文搜索

对已有数据库操作前先备份。执行 `init.sql` 后，打开任务页面：

1. 运行“检查索引与查询计划”，查看当前索引和查询情况。
2. 运行“盘点并补齐索引”，补齐缺失索引，并按主键分批、可续跑地回填搜索侧表。
3. 回填完成后，任务会自动创建全文索引。

初始化 SQL 不会在回填前建立全文索引，避免百万级数据回填时增加持续的索引维护开销。回填完成后再次执行 `init.sql`，也会补建缺失的全文索引。已有主表的索引不会被 `CREATE TABLE IF NOT EXISTS` 修改，应通过任务页面检查和补齐。

生产数据库连接信息读取 `config/.prod.importgenius`，也可由部署环境变量 `IMPORTGENIUS_PRODUCTION_DB_*` 覆盖；真实配置文件已忽略 Git，不提交账号或密码。
