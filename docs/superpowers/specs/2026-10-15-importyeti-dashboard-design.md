# ImportYeti 数据展示页设计

## 状态

设计已由用户确认。本文描述在现有 Import Desk React 应用中增加 ImportYeti 展示页的范围和行为。

## 目标

让用户通过当前 app 浏览已经写入 MySQL `iy_*` 表的 ImportYeti 采集数据。页面沿用现有导航、`PageHeading`、Ant Design 卡片、表格、筛选和分页样式。

## 页面结构

- 在主侧栏增加 ImportYeti 导航项，路由为 `/app/importyeti`。
- 页面顶部显示提单数、公司数、供应商数三项概览。
- 页面主体分为“提单记录”和“公司 / 供应商”两个标签页。
- 表格支持响应式横向滚动、分页、加载态、空数据态和错误提示。

### 提单记录

筛选项：关键词、起止日期。关键词匹配提单号、公司、供应商和货品描述。

列：到港日期、提单号、采购商、供应商、供应商国家、货品描述、重量、数量、进/出口港、HS 编码、来源链接。字段无值时显示 `-`。公司和供应商名称关联 `iy_entities`，HS 编码关联 `iy_shipment_hs_codes`。

### 公司 / 供应商

筛选项：实体类型（全部、公司、供应商）和关键词（名称、slug、国家）。

列：类型、名称、国家、累计提单数、贸易关系数、最近采集时间、来源链接。关系数从 `iy_entity_relations` 统计；来源链接跳转 ImportYeti 对应公开 profile。

## 后端接口与数据流

Koa 增加三个只读接口：

- `GET /getImportyeti/summary`：返回提单、公司、供应商总量。
- `GET /getImportyeti/shipments`：接受 `pageIndex`、`pageSize`、`keyword`、`fromDate`、`toDate`，返回分页提单及总数。
- `GET /getImportyeti/entities`：接受 `pageIndex`、`pageSize`、`entityType`、`keyword`，返回分页实体及总数。

查询复用 `importyeti/db.js` 的 MySQL 连接池，并通过已配置的 `IMPORTYETI_DB_*` 连接 `iy_*` 表。SQL 使用参数绑定；页码、日期和实体类型在服务端校验，`pageSize` 最大为 100。前端使用现有 `/api` 前缀规则调用接口。

## 状态与错误处理

- 加载期间显示 Ant Design 加载状态。
- 查询成功但无记录时显示空表提示，不填充演示数据。
- MySQL 未配置、表不存在或查询失败时，接口返回非 2xx 和简洁错误信息；页面展示错误提示并允许用户重试。
- 数据库查询只读；此页面不修改或删除采集数据。

## 验收条件

1. 侧栏可进入 `/app/importyeti`，且当前菜单项正确高亮。
2. 概览数字来自数据库统计，两个标签页分别展示提单和实体数据。
3. 筛选与分页会调用后端接口并显示返回结果。
4. 未配置数据库或数据库为空时，页面显示可理解的错误或空状态。
5. 页面遵循现有布局和 Ant Design 视觉样式，不影响现有数据页。

## 约束

- 只使用当前采集器定义的 `iy_*` 表，不修改 ImportGenius 数据结构。
- 不新增写操作、批量导出或采集控制功能。
- 实际数据可见性依赖 `.env.importyeti` 中 MySQL 配置以及数据库已有采集记录。
