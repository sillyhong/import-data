### 安装依赖

```bash
npm ci --include=dev
```

当前 Koa、路由等运行依赖仍列在 `devDependencies`，生产安装也需要保留这些依赖。先按下方说明准备 `config/` 中对应环境的配置，再启动服务。

### 启动 web 服务

1.  `npm run start`
2.  运行在 8080 端口
3.  访问 http://localhost:8080/app

### 启动 koa server

1. 本地数据库：`npm run server:dev`；生产数据库：`npm run server`
2. 运行在 8081 端口
3. 启动 koa server, 默认运行在 8081 端口, 尝试访问 `http://localhost:8081/american/shower-door/1.json`
4. 在 package.json 增加了代理，`"proxy": "http://localhost:8081`
5. 访问 `http://localhost:8080/american/shower-door/1.json` --> `http://localhost:8081/american/shower-door/1.json`

一次启动前后端可用 `npm run start:all:dev`（本地配置）或 `npm run start:all:prod`（生产配置）。两者都在 8080 启动 React 开发服务器，并在 8081 启动对应环境的 API，适合本机联调。

侧栏“任务执行”页面（`/app/tasks`）可启动 ImportGenius 抓取、入库和完整同步任务，也可控制周定时任务及 ImportYeti 采集、状态和导出。页面只提交固定任务 ID 与校验后的参数，不接受 shell 命令。本地运行只连接本地配置，不要求控制令牌；`npm run server` 设置生产环境，启动时会读取 `config/.prod.importgenius` 中的 `TASK_CONTROL_TOKEN`。生产写操作需页面确认、确认勾选及输入同一控制令牌。

ImportGenius 新采集按 `importgenius/data/importer/<国家>/<上海日期>/<时间-唯一标识>/<页码>.json` 保存，同日多次执行也互不覆盖。任务页可选择“新建采集”或“续跑已有批次”；详情和入库必须选择来源批次，完整流程与周采集自动贯穿同一批次。`manifest.json` 保存列表、详情和入库进度；续跑不会刷新已保存列表，新批次重新抓取当前详情。旧平铺 JSON 以 `legacy` 继续处理。CLI 新采集需指定 `--pages`，续跑用 `--batch <批次ID>`，不选批次会创建新采集；历史快照不再支持 `--cleanup` 自动删除。详细目录、命令及兼容规则见 [ImportGenius 采集批次说明](importgenius/README.md#一键抓取与入库)。

#### 客户开发任务（Facebook / Instagram / TikTok / Gmail）

侧栏 **客户开发任务**（`/app/robot-tasks`）接入 `my-robot` 的固定任务入口，提供平台筛选、任务搜索、详细执行说明、执行/终止、运行日志和优化分析。记录统一进入 **任务日志**，分类为“客户开发”。旧的海关采集任务与定时器保持原入口。

本机目录为 `Documents/import-data` 与 `Documents/bot/my-robot` 时可自动定位；其他机器或部署位置请在**启动 API 的进程环境**中设置绝对路径：

```bash
MY_ROBOT_ROOT=/absolute/path/to/my-robot npm run server:dev
```

`MY_ROBOT_ROOT` 由服务端读取，不从页面接收；它不是数据库配置字段，也不会从数据库 `.env` 文件自动加载。修改后重启 API。两项目依赖分别安装；`my-robot` 必须包含本次适配的 `startApp` 导出入口。部署到其他机器时需同时部署脚本目录、所需依赖和浏览器环境。

- 先运行“检查本地客户名单与任务接入状态”：只读取固定名单文件并输出数量、重复和历史标记冲突，不连接浏览器、不执行名单 JS、不修改名单。历史标记不等于送达或有效客户。
- Web 任务依赖 Chrome、9222 调试会话和已登录的平台账号。执行确认框会列出实际动作；关注、添加好友、私信与预约邮件均会影响外部账号。共享浏览器的任务串行执行。
- Gmail 首轮/第二轮/第三轮批次上限分别为 20/50/20；社媒私信采用脚本现有上限。首版不提供脚本尚未支持的自定义限额和间隔。
- Gmail 成功只说明脚本确认了预约界面结果，不代表收件人已收到。私信提交也不代表对方阅读。终止不撤销已经提交的关注、消息或预约；结果不明确时先核对平台记录。
- 本次未新增客户开发定时调度。Android、会重置名单状态的历史工具及未完成的网站检查在页面说明限制，不提供伪执行入口。
- 原始脚本日志可能含联系人和会话信息，桥接器仅向任务日志写受控摘要。诊断与外部任务沿用当前环境、同源校验；生产外部操作与终止仍需任务控制令牌。

Web 任务连接**已启动并登录的专用 Chrome 会话**。macOS 可手动启动以下会话，并在该窗口中登录需要的平台（本命令不会发送任何消息）：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/my-robot/Chrome"
```

Chrome 136 起，远程调试需要非默认用户数据目录，见 [Chrome 官方说明](https://developer.chrome.com/blog/remote-debugging-port)。如调试地址不同，在 API 进程环境中设置 `MY_ROBOT_DEBUGGER_ADDRESS=127.0.0.1:其他端口`；脚本使用 Selenium 的 `debuggerAddress()` 连接，不会自动登录。只有诊断名单不要求浏览器会话。

项目审查、优先级与后续改造建议见 [客户开发分析](docs/analysis/2026-10-25-customer-acquisition-review.md)。真实平台页面可能变化；本次验证使用模拟任务和只读诊断，不触发真实关注、私信或邮件。

#### 任务执行日志

任务页手动执行与定时触发统一记录到项目根目录的 `logs/tasks/`（首次执行自动创建，已忽略 Git）。每次执行对应两个文件，以上海日期和 UUID 命名；原 `logs/scheduler/` 的历史保持原位，仍可查询和清理。

- `.json`：任务 ID/名称、触发方式（手动/定时）、环境、Cron（定时任务）、时区、触发/开始/结束时间、完整生效参数、运行 ID、状态、耗时、退出码及错误信息。
- `.jsonl`：带时间和 stdout/stderr 标记的完整输出，页面日志尾部的截断不影响文件内容。

任务管理器统一采集各业务脚本的 stdout/stderr，并补充开始、结束、超时及终止过程日志。只读任务与日志清理任务同样记录；stderr 输出本身不代表任务失败，结果以退出状态为准。运行冲突而跳过、启动失败、执行失败和手动终止也保留记录。初始日志写入失败时不启动该次任务，并报告错误。此前未保存的手动运行历史无法补回；服务异常退出时，未结束的文件保留当时状态，不会推断为成功。

侧栏 **任务日志**（`/app/task-logs`，兼容原 `/app/scheduler-logs` 地址）读取两处固定目录，服务重启后仍可查询。支持按触发方式、分类、状态、上海时区的触发日期和关键词筛选；“更多筛选”提供具体任务、环境、国家和运行 ID。旧定时记录没有触发方式字段时按“定时”显示。列表默认按最新触发时间排序，使用显示准确总条数、页数、每页条数及跳页的标准分页。列表关键词只匹配任务、ID、参数和错误等元数据，不扫描完整输出。

点击记录详情可查看完整参数、执行时间及错误，并按 stdout/stderr 和输出关键词分批加载完整日志。目录为空时展示空状态；格式损坏或不受支持的记录会跳过，并提示数量，不补造历史数据。

在 `/app/tasks` → **日志管理** → **任务日志** 卡中填写保留天数后“执行清理”。默认保留 30 天，以执行结束时间判断；`0` 清理两处目录全部已结束记录。清理仅作用于固定目录中的成对日志文件，运行中的记录（包括本次清理任务）、未知文件及符号链接均保留。生产执行沿用任务控制令牌与确认流程；“查看历史日志”进入日志查询栏目，“查看清理日志”展示本次清理任务的输出。每张任务卡也可通过“历史详情”查看该次执行的持久化记录。

#### 数据库配置与运行环境

两套数据源统一读取项目根目录的 `config/`，由显式的 `TASK_ENV=local` 或 `TASK_ENV=production` 选择配置。路径相对于项目固定，不随启动目录变化；项目根目录旧的 `.env.importgenius` / `.env.importyeti` 不再加载，也不会跨环境回退。

| 数据源 | 本地配置（local） | 生产配置（production） | 新配置的变量前缀 |
| --- | --- | --- | --- |
| ImportGenius | `config/.env.importgenius` | `config/.prod.importgenius` | `IMPORTGENIUS_LOCAL_DB_*` / `IMPORTGENIUS_PRODUCTION_DB_*` |
| ImportYeti | `config/.env.importyeti` | `config/.prod.importyeti` | `IMPORTYETI_LOCAL_DB_*` / `IMPORTYETI_PRODUCTION_DB_*` |

现有四份配置直接维护。新建配置时，按上表文件名与标准前缀填写 `HOST`、`PORT`、`USER`、`PASSWORD`、`NAME`。生产 ImportGenius 可参考本次提供的样例，以下 `cp -n` 不覆盖已有文件：

```bash
cp -n config/.prod.importgenius.example config/.prod.importgenius
```

数据库连接字段优先级为：外部进程环境中的当前环境标准变量 → 所选文件的标准变量 → 所选文件的旧键名别名。旧的 `IMPORTYETI_DB_*`、`IMPORTGENIUS_DB_*` 或生产文件内的 `*_LOCAL_DB_*` 可继续识别；兼容仅限本次选中的文件，生产不会使用进程环境中的 `*_LOCAL_DB_*`。新配置使用上表标准前缀，密码含 `#` 时用引号包住，例如 `PASSWORD="replace#this"`。

```bash
# 本地：脚本设置 TASK_ENV=local
npm run server:dev

# 生产：脚本设置 TASK_ENV=production、NODE_ENV=production
# 在 config/.prod.importgenius 中填写 TASK_CONTROL_TOKEN
npm run server

# 生产 ImportYeti CLI：固定使用生产配置
npm run importyeti:production -- status
```

生产 API 启动时，仅从 `config/.prod.importgenius` 将 `TASK_CONTROL_TOKEN` 加载为任务控制配置；填写足够长的随机令牌，页面确认时输入同值。它不会从 `.prod.importyeti` 读取令牌，也不会将文件内的数据库键、`TASK_ENV` 或 `NODE_ENV` 加载到全局进程环境。外部显式设置的 `TASK_CONTROL_TOKEN` 优先，包括显式空值；若此前 `export` 过令牌，可执行 `unset TASK_CONTROL_TOKEN` 后重新启动，让文件配置生效。修改令牌后需重启 API。

也可通过外部环境注入当前环境的标准数据库变量；即使生产数据库配置文件不存在，只要外部标准连接配置齐全，仍可运行。未知 `TASK_ENV` 或缺失必要连接配置会明确报错。数据库配置读取不会把文件中的键批量写入 `process.env`。四个真实配置文件已忽略 Git，详细字段与兼容规则见 [config/README.md](config/README.md)。

修改数据库配置后重启后端，CLI 任务需重新运行；已经建立的连接池不会热切换数据库。

生产 API 保持单实例运行：启动后自动启用周日 00:00（Asia/Shanghai）定时采集；MySQL named lock 会阻止不同服务实例同时运行同一数据源的任务。任务日志持久化及清理方式见上节。

ImportGenius / ImportYeti 的功能目录和数据库初始化说明分别见 [ImportGenius README](importgenius/README.md) 与 [ImportYeti README](importyeti/README.md)。ImportGenius 初始化与升级 SQL 统一位于 `importgenius/database/init.sql`；旧库执行前先备份，再通过任务页补索引并回填搜索侧表。

### 海关数据

搜索 goole 标签页 -- 外贸海关数据 -- [料神外贸数据](https://data.imiker.com/#left_top)

#### fetchShipments

2024-05-21 usa 1801
2024-05-21 argentina 406
2024-05-21 chile 200
2024-05-21 colombia 201
2024-09-22 uruguay 126(TO BE DONE)

#### 插入数据库

**local 数据库**
2024-05-03 usa 已经插入 700
2024-05-06 usa 已经插入 1000
2024-05-08 usa 已经插入 1400
2024-05-11 usa 已经插入 1801
2024-05-21 argentina 已经插入 406
2024-09-22 panama 已经插入 201

**cloud 数据库**
2024-05-21 usa 已经插入 1801
2024-05-21 argentina 已经插入 406
2024-05-21 chile 已经插入 200
2024-05-21 colombia 已经插入 201
2024-05-21 india 已经插入 326
2024-09-22 panama 已经插入 201
2025-12-07 use 插入截止时间2024-09-22
2025-12-07 chile india colombia panama删除文件夹

### ImportYeti（公开页面采集）

采集器写入单独的 MySQL `iy_*` 表，不读取或修改 ImportGenius 的数据库配置。它从公司/供应商公开 profile 页面提取页面可见的近期提单、实体关系、HTS Code 和国家汇总，并从已发现的 profile 关系继续扩展。

```bash
# 在 config/.env.importyeti 填写 IMPORTYETI_LOCAL_DB_* 后：
npm run importyeti:init
npm run importyeti -- seed https://www.importyeti.com/company/wal-mart
npm run importyeti:crawl -- --max-targets 100 --max-depth 2
npm run importyeti:status
npm run importyeti:export -- --out exports/importyeti-shipments.csv
```

也可以准备一个每行一个 ImportYeti profile URL 的文本/CSV 文件，再运行 `npm run importyeti -- seed --file targets.csv`。

如需从可公开访问的 ImportInfo 公司页补充同一主/分提单的港口、货品描述、重量和国家，可显式提供该公司页：

```bash
npm run importyeti:enrich-importinfo -- https://www.importinfo.com/gemtek-vietnam-corporation-limited
```

该命令按分提单号精确匹配后才回填；HS 编码仅在舱单明确列出时写入。若公开页未提供编码，页面会标记“原始舱单未提供”。

启动前后端后，可在侧栏进入 ImportYeti 页面（`/app/importyeti`）浏览数据库中的提单与实体数据；页面的后端查询复用当前 `TASK_ENV` 对应的 MySQL 配置。列表使用主键游标分页，不执行每页精确总数；概览数字来自 InnoDB 统计信息，为估算值。关键词使用 MySQL FULLTEXT 分词前缀搜索，不提供任意子串搜索。

需要手动创建 ImportYeti 数据库和表时，先执行 `mysql -u <用户名> -p < importyeti/database/bootstrap/create_database.sql`，再执行 `mysql -u <用户名> -p import_data < importyeti/database/migrations/001_initial_schema.sql`。脚本默认创建 `import_data`；如果改了库名，也要同步修改对应环境下的 `IMPORTYETI_*_DB_NAME`。也可在 `/app/tasks` 执行“初始化表与索引”任务；它只在显式点击后运行，不会随 API 启动自动执行。

百万行以上的索引构建会消耗磁盘、I/O 和构建时间。任务页“检查索引与查询计划”可只读查看 MySQL 版本、表大小估算、现有索引和 `EXPLAIN` 静态计划；“盘点并补齐索引”会补缺失的 B-Tree 索引，并创建 `importgenius_search` 侧表，按主键每批 100 条回填历史商品描述，进度保存在 `importgenius_search_backfill`，中断后可续跑。旧的 `product_description_generated` 若为虚拟生成列，不能用于 InnoDB FULLTEXT；独立侧表避免该限制，并让主表查询不执行 JSON 解析或前导通配符扫描，但会额外占用磁盘。

生产执行索引任务前，先核对 MySQL 版本、磁盘空间和现有索引。新增的百万行 B-Tree 索引可能耗时；FULLTEXT 建立还会消耗 I/O。完成后再用 `EXPLAIN ANALYZE` 核对真实扫描行数和耗时。应用内的“检查索引与查询计划”只执行静态 `EXPLAIN`，不会扫描全表，也不会代替生产数据上的实际计划验证。

采集器遵守各来源的 `robots.txt`，请求间隔至少 2 秒；ImportYeti 采集只访问 `/company/<slug>` 和 `/supplier/<slug>` 公开 profile，不调用被 robots 禁止的搜索路径。出现 401、403、429 或反爬挑战时会停止，不会尝试绕过。免费公开页只提供有限的提单和字段；未公开的字段不会推测。可在当前环境对应的 ImportYeti 配置文件中设置 `IMPORTYETI_STORE_RAW_HTML=1` 保存 ImportYeti 页面快照原文，默认只保存解析结果。

修复访问限制或确认目标可访问后，可用 `npm run importyeti:crawl -- --retry-blocked` 重新尝试被阻止的目标；普通解析/网络失败目标可用 `--retry-failed` 重试。
