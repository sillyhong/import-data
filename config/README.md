# 数据源环境配置

应用、任务 worker 和 CLI 共用此目录。配置路径固定在项目根目录下，不随 `cwd` 变化，也不再读取项目根目录旧的 `.env.importgenius` / `.env.importyeti`。

## 文件与环境对应

| TASK_ENV | 数据源 | 配置文件 | 新配置标准前缀 |
| --- | --- | --- | --- |
| local | ImportGenius | `.env.importgenius` | `IMPORTGENIUS_LOCAL_DB_*` |
| production | ImportGenius | `.prod.importgenius` | `IMPORTGENIUS_PRODUCTION_DB_*` |
| local | ImportYeti | `.env.importyeti` | `IMPORTYETI_LOCAL_DB_*` |
| production | ImportYeti | `.prod.importyeti` | `IMPORTYETI_PRODUCTION_DB_*` |

现有四份配置直接保留或编辑。需要新建时，按上表路径和标准前缀手动创建文件，再填写账号和数据库地址。生产 ImportGenius 提供 `.prod.importgenius.example` 样例；以下命令在项目根目录执行，`cp -n` 不覆盖现有配置：

```bash
cp -n config/.prod.importgenius.example config/.prod.importgenius
```

四个真实配置文件已忽略 Git；`.prod.importgenius.example` 只包含占位连接信息和空令牌，可提交。

## 连接字段与优先级

每个标准前缀后填写 `HOST`、`PORT`、`USER`、`PASSWORD`、`NAME`，例如 `IMPORTGENIUS_PRODUCTION_DB_HOST`。含 `#` 的密码必须用引号包住，防止被当作注释：

```dotenv
IMPORTGENIUS_PRODUCTION_DB_PASSWORD="replace#this-password"
```

数据库连接字段按以下顺序取值：

1. 当前 `TASK_ENV` 对应的外部标准环境变量。
2. 当前选中配置文件中的标准变量。
3. 当前选中文件内兼容的旧键名，如 `IMPORTGENIUS_DB_*`、`IMPORTYETI_DB_*` 或 `*_LOCAL_DB_*`。

旧键名兼容用于保留现有配置；新文件采用上表标准前缀。兼容仅作用于所选文件：生产不会读取本地 `.env.*` 文件，也不会从进程环境中的 `*_LOCAL_DB_*` 取值。配置读取不会把文件中的键批量写入 `process.env`，数据库、采集器、详情补充和 CLI 通过公共读取器获取各自选项。

未知或未显式指定 `TASK_ENV` 会报错；缺少必要连接项也会报错。若通过外部环境完整提供当前环境的标准数据库配置，则可省略对应文件，包括生产配置文件。

修改数据库配置后需重启后端，或重新运行 CLI 任务；已有连接池不会在运行中热切换数据库。根目录旧 `.env*.example` 如仍保留，仅作历史说明；当前文件名和字段以上表为准。

## 连接池与采集选项

相应数据源文件还可保留以下选项：

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `IMPORTGENIUS_DB_CONNECTION_LIMIT` | `10` | ImportGenius 连接池上限 |
| `IMPORTGENIUS_RETRY_ATTEMPTS` | `4` | ImportGenius 暂时性请求/数据库错误的总尝试次数，包含首次执行 |
| `IMPORTGENIUS_COUNTRY` | `usa` | 直接运行历史单独入库脚本时的国家；任务页与 CLI 显式参数不受此项覆盖 |
| `IMPORTYETI_DB_CONNECTION_LIMIT` | `10` | ImportYeti 连接池上限 |
| `IMPORTYETI_DELAY_MS` | `3000` | ImportYeti 请求间隔，至少 2000 ms |
| `IMPORTYETI_TIMEOUT_MS` | `25000` | ImportYeti 请求超时，至少 10000 ms |
| `IMPORTYETI_USER_AGENT` | `import-data-local/1.0` | ImportYeti 请求标识，可按部署填写 |
| `IMPORTYETI_STORE_RAW_HTML` | `0` | `1` 保存公开页原始 HTML，否则仅保存解析结果 |

## 生产任务控制令牌

生产 API 启动时会自动读取本目录 `.prod.importgenius` 中的 `TASK_CONTROL_TOKEN`。填写一个足够长的随机令牌，生产页面操作确认时输入相同值；本地环境不要求令牌。

```dotenv
TASK_CONTROL_TOKEN="replace-with-a-long-random-token"
```

此启动加载只允许 `TASK_CONTROL_TOKEN` 一个键；不会读取 `.prod.importyeti` 中的令牌，不会把数据库配置键批量写入进程环境，也不允许文件改变 `TASK_ENV` / `NODE_ENV`。已经显式设置的进程环境变量优先于文件，显式空值也会覆盖文件值。若当前终端之前 `export` 过令牌，可取消覆盖并重启生产 API：

```bash
unset TASK_CONTROL_TOKEN
npm run server
```

修改文件中的令牌后需重启 API，运行中的服务不会自动更换控制令牌。

## 启动方式

```bash
# 本地 API，脚本设置 TASK_ENV=local
npm run server:dev

# 生产 API，脚本设置 TASK_ENV=production、NODE_ENV=production
# TASK_CONTROL_TOKEN 从 config/.prod.importgenius 自动加载
npm run server

# 同时启动 React 开发服务器与本地环境 API
npm run start:all:dev

# 同时启动 React 开发服务器与生产环境 API，用于本机联调
npm run start:all:prod

# 生产 ImportYeti CLI，使用 config/.prod.importyeti
npm run importyeti:production -- status
```

任务接口仅检查 `Origin` 请求头是否存在且格式有效，不再比对来源域名、协议和端口，也不依赖代理转发的来源信息。生产写操作继续校验任务控制令牌和二次确认；`TASK_ALLOW_LOCAL_DEV_ORIGIN` 不再参与任务接口校验。

生产 API 保持单实例，启动后自动启用周日 00:00（Asia/Shanghai）定时采集；任务日志仍保存到项目根目录 `logs/tasks/`，旧 `logs/scheduler/` 历史仍可查询及清理。
