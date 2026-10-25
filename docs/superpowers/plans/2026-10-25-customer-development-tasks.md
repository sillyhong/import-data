# Customer Development Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 import-data 中管理 my-robot 的客户开发任务，展示完整说明、真实执行记录和有依据的优化分析。

**Architecture:** 用现有 Koa task-runner 运行固定 robot worker，前端独立路由复用任务 API 和日志页面。my-robot 导出可等待的入口并修复结果误标、错误吞没与文件写入问题；未适配功能禁用。

**Tech Stack:** React 18、Ant Design 4、Koa、Node.js 子进程与 node:test、Jest/Testing Library。

---

### Task 1: 固定任务目录与执行桥接

Files: create `server/robot/catalog.js`, `server/robot/runtime.js`, `server/robot/runtime.test.js`; modify `server/task-runner.js`, `server/controller/tasks.js`, `server/tasks/worker.js`.

- [ ] 编写临时目录/模拟入口测试：缺失根目录拒绝执行、任意 taskId/参数被拒绝、外部动作缺少 acknowledged 返回 400、只读名单统计去重但不输出个人资料、失败返回非零、取消释放锁。
- [ ] 目录定义使用固定 ID 与任务元数据，接口遵循规格：

```js
{ id: 'robot.email.first', platform: 'email', readOnly: false,
  sourceScript: 'email/emailApp.js', inputs: [], outputs: [], steps: [],
  effects: ['预约发送邮件', '更新本地首轮处理标记'],
  prerequisites: [], limitations: [], batchLimit: 20 }
```

- [ ] 服务端解析 MY_ROBOT_ROOT，固定脚本清单，校验适配入口再动态 require；调用方式为 `await require(absoluteScript).startApp()`，不拼接 shell、不接收浏览器路径。
- [ ] 接入现有控制器参数/权限、全局互斥、持久化日志；新增磁盘锁和脱敏；robot worker 不初始化无关数据库。
- [ ] 运行 `node --test server/robot/*.test.js server/controller/tasks.test.js server/task-runner.test.js`，预期全部通过，且不会启动真实脚本。

### Task 2: my-robot 可靠入口与结果修复

Files: modify nine web/email entries, `utils/writeNameFile.js`, `email/timeConfig.js`; add `utils/taskEntry.js`, `utils/taskEntry.test.js` as needed.

- [ ] 使用模拟 driver/结果写回测试复现未发送仍标记成功与写盘覆盖风险。
- [ ] 九个入口均采用以下可等待结构，保留原 CLI：

```js
module.exports = { startApp };
if (require.main === module) {
  startApp().catch(error => { console.error(error.message); process.exitCode = 1; });
}
```

- [ ] 顶层异常 rethrow、driver 只在 finally 判空释放；浏览器内数据返回 Node 后写盘；异步 forEach 改为串行等待。
- [ ] 发送函数返回明确布尔/结构化结果，只有正确完成操作才更新 hasChated/hasUsed；不存在按钮/会话返回跳过或抛错。保留“提交/预约”语义，不增加送达声称。
- [ ] 名单使用同目录临时文件与 rename 原子替换；未知国家回退 default；次工作日使用确定时钟测试周五、周六、周日。
- [ ] 执行 node:test 与 `node --check`，不调用真实 startApp。

### Task 3: 页面、导航和优化分析

Files: create `src/RobotTasks.js`, `src/RobotTasks.css`, `src/RobotInsights.js`, `src/RobotTasks.test.js`; modify `src/AppLayout.js`, `src/index.js`.

- [ ] 编写任务分类/搜索、未配置禁用、动作确认、启动失败/终止与日志链接测试，API 全部 mock。
- [ ] 增加 `/app/robot-tasks` 和导航；从 `getTaskCatalog()` 读取 robot 元数据，保持原有 API。
- [ ] 实现平台分类、搜索、完整说明折叠、实际动作确认、生产令牌、真实状态轮询、日志和历史链接。
- [ ] 添加按优先级和平台筛选的优化分析，包含代码依据、验收指标和官方来源；不得把历史布尔统计称为有效客户或送达数。
- [ ] 运行 `CI=true npm test -- --watchAll=false --runInBand src/RobotTasks.test.js src/TaskRunner.test.js` 和 `npm run build`，预期通过。

### Task 4: 整体验证与交付

Files: update `README.md` with MY_ROBOT_ROOT、入口与限制；将本次分析写入 `docs/analysis/2026-10-25-customer-acquisition-review.md`。

- [ ] 对照设计逐条检查新任务说明、能力状态、日志/终止权限和错误传播；独立审查改动，修复发现。
- [ ] 在可用本地服务或自有预览服务中检查新页面、分类、展开和移动布局；请求只读 API，不触发外部任务。
- [ ] 确认两个仓库既有修改保留，输出启动方式、页面地址、测试结果与未进行真实触达验证的限制。
