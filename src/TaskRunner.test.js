import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TaskRunner from './TaskRunner';
import { getImportGeniusBatches, getTaskCatalog, getTaskRun, runTask, stopTask } from './API/tasks';

const mockMessages = { success: jest.fn(), error: jest.fn() };

jest.mock('./API/tasks', () => ({
  getTaskCatalog: jest.fn(),
  getImportGeniusBatches: jest.fn(),
  getTaskRun: jest.fn(),
  runTask: jest.fn(),
  stopTask: jest.fn(),
  updateTaskScheduler: jest.fn(),
}));

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return { ...actual, message: { ...actual.message, useMessage: () => [mockMessages, null] } };
});

const activeRun = {
  runId: 'run-active', taskId: 'importgenius.fetch-shipments', status: 'running',
  startedAt: '2026-10-22T08:00:00Z', durationMs: null, logs: [],
};

const pendingBatch = {
  batchId: '20261026/103025-a7f3abcd', country: 'usa', environment: 'local',
  createdAt: '2026-10-26T02:30:25Z', updatedAt: '2026-10-26T02:31:25Z',
  pages: Array.from({ length: 10 }, (_, index) => index + 1), totalPages: 10,
  progress: { list: 10, details: 3, import: 0 }, legacy: false,
};

function catalog(run = activeRun, overrides = {}) {
  return {
    environment: 'local', productionControlConfigured: false,
    activeRunId: ['running', 'stopping'].includes(run.status) ? run.runId : null,
    scheduler: { enabled: false },
    tasks: [
      { id: activeRun.taskId, name: '补充 shipment 明细', group: 'ImportGenius', description: '抓取详情', latestRun: run },
      { id: 'importgenius.fetch-importers', name: '抓取 importer 列表', group: 'ImportGenius', description: '抓取列表', latestRun: null },
    ],
    ...overrides,
  };
}

function card(title) {
  return screen.getByText(title, { selector: '.task-card-title' }).closest('.task-item-card');
}

function readyCatalog() {
  const ready = catalog({ ...activeRun, status: 'success' });
  ready.tasks.push(
    { id: 'importgenius.import-batch', name: '批量写入 MySQL', group: 'ImportGenius', description: '写入选定批次', latestRun: null },
    { id: 'importgenius.full-sync', name: '完整采集流程', group: 'ImportGenius', description: '按批次采集', latestRun: null }
  );
  return ready;
}

async function chooseOption(label, text) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByText(text, { selector: '.ant-select-item-option-content' }));
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: query => ({
      matches: false, media: query, onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
    }),
  });
});

afterAll(() => { jest.restoreAllMocks(); });

beforeEach(() => {
  jest.clearAllMocks();
  getImportGeniusBatches.mockResolvedValue({ batches: [pendingBatch] });
  runTask.mockImplementation(async (taskId, params) => ({ ...activeRun, taskId, params, status: 'success' }));
});
afterEach(() => { jest.useRealTimers(); });

test('every card has a stop button, enabled only for its current running instance', async () => {
  getTaskCatalog.mockResolvedValue(catalog());
  render(<TaskRunner />);
  await screen.findByText('补充 shipment 明细', { selector: '.task-card-title' });

  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /终止任务/ })).toBeEnabled();
  expect(within(card('抓取 importer 列表')).getByRole('button', { name: /终止任务/ })).toBeDisabled();
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
});

test('stop sends the exact run once, polls stopping through to stopped, and preserves its logs', async () => {
  jest.useFakeTimers();
  const stopping = { ...activeRun, status: 'stopping' };
  const stopped = { ...activeRun, status: 'stopped', durationMs: 1200, logs: [{ at: activeRun.startedAt, stream: 'stdout', text: '任务已按用户要求终止。' }] };
  let finishStop;
  stopTask.mockReturnValue(new Promise(resolve => { finishStop = resolve; }));
  getTaskCatalog.mockResolvedValueOnce(catalog()).mockResolvedValueOnce(catalog(stopping)).mockResolvedValue(catalog(stopped));
  getTaskRun.mockResolvedValue(stopped);
  render(<TaskRunner />);
  await screen.findByText('补充 shipment 明细', { selector: '.task-card-title' });

  const button = within(card('补充 shipment 明细')).getByRole('button', { name: /终止任务/ });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(stopTask).toHaveBeenCalledTimes(1);
  expect(stopTask).toHaveBeenCalledWith(activeRun.taskId, activeRun.runId, {});
  expect(button).toBeDisabled();
  await act(async () => { finishStop(stopping); });
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /终止中/ })).toBeDisabled();

  await act(async () => { jest.advanceTimersByTime(2500); });
  expect(getTaskRun).toHaveBeenCalledWith(activeRun.taskId, activeRun.runId);
  expect(screen.getAllByText('已终止').length).toBeGreaterThan(0);
  expect(screen.getByText(/任务已按用户要求终止/)).toBeInTheDocument();
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeEnabled();
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /终止任务/ })).toBeDisabled();
});

test('production stop requires token confirmation even when the task itself is read only', async () => {
  const run = { ...activeRun, taskId: 'database.inspect' };
  const production = catalog(run, {
    environment: 'production', productionControlConfigured: true,
    tasks: [{ id: run.taskId, name: '检查索引与查询计划', group: '数据库', description: '只读检查', latestRun: run }],
  });
  getTaskCatalog.mockResolvedValue(production);
  stopTask.mockResolvedValue({ ...run, status: 'stopping' });
  render(<TaskRunner />);
  fireEvent.click(await screen.findByRole('tab', { name: /数据库/ }));
  await screen.findByText('检查索引与查询计划', { selector: '.task-card-title' });
  fireEvent.click(within(card('检查索引与查询计划')).getByRole('button', { name: /终止任务/ }));

  const confirm = await screen.findByRole('button', { name: '确认终止' });
  expect(confirm).toBeDisabled();
  expect(stopTask).not.toHaveBeenCalled();
  fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: 'control-token' } });
  fireEvent.click(screen.getByRole('checkbox', { name: '我已确认在生产环境执行此操作' }));
  await act(async () => { fireEvent.click(confirm); });

  await waitFor(() => expect(stopTask).toHaveBeenCalledWith(run.taskId, run.runId, { token: 'control-token', confirmed: true }));
});

test('a stale stop failure refreshes terminal state instead of leaving the card stuck', async () => {
  getTaskCatalog.mockResolvedValueOnce(catalog()).mockResolvedValue(catalog({ ...activeRun, status: 'success' }));
  stopTask.mockRejectedValue(new Error('任务已结束。'));
  render(<TaskRunner />);
  await screen.findByText('补充 shipment 明细', { selector: '.task-card-title' });
  fireEvent.click(within(card('补充 shipment 明细')).getByRole('button', { name: /终止任务/ }));

  await waitFor(() => expect(mockMessages.error).toHaveBeenCalledWith('任务已结束。'));
  await waitFor(() => expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeEnabled());
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /终止任务/ })).toBeDisabled();
});

test('new collection can run without any existing batch while details and import require one', async () => {
  getTaskCatalog.mockResolvedValue(readyCatalog());
  getImportGeniusBatches.mockResolvedValue({ batches: [] });
  render(<TaskRunner />);
  await screen.findByText('完整采集流程', { selector: '.task-card-title' });
  await waitFor(() => expect(getImportGeniusBatches).toHaveBeenCalledWith('usa'));

  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(within(card('批量写入 MySQL')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  const start = within(card('完整采集流程')).getByRole('button', { name: /执行任务/ });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.change(screen.getByRole('textbox', { name: '页码 / 范围' }), { target: { value: '1-2' } });
  fireEvent.click(start);
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.full-sync', { country: 'usa', pages: [1, 2] }, {}));
});

test('defaults to an unfinished batch and binds details, import and explicit resume to that exact batch', async () => {
  const incomplete = { ...pendingBatch, pages: [3, 4], totalPages: 2, progress: { list: 2, details: 1, import: 0 } };
  const complete = { ...pendingBatch, batchId: '20261026/163025-b7f3abcd', createdAt: '2026-10-26T08:30:25Z', pages: [1], totalPages: 1, progress: { list: 1, details: 1, import: 1 } };
  getTaskCatalog.mockResolvedValue(readyCatalog());
  getImportGeniusBatches.mockResolvedValue({ batches: [complete, incomplete] });
  render(<TaskRunner />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue('3,4'));

  fireEvent.click(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.fetch-shipments', { country: 'usa', pages: [3, 4], batchId: incomplete.batchId }, {}));
  await waitFor(() => expect(within(card('批量写入 MySQL')).getByRole('button', { name: /执行任务/ })).toBeEnabled());
  fireEvent.click(within(card('批量写入 MySQL')).getByRole('button', { name: /执行任务/ }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.import-batch', { country: 'usa', pages: [3, 4], batchId: incomplete.batchId }, {}));

  await chooseOption('列表与完整流程启动方式', '续跑已有批次');
  await waitFor(() => expect(within(card('完整采集流程')).getByRole('button', { name: /执行任务/ })).toBeEnabled());
  fireEvent.click(within(card('完整采集流程')).getByRole('button', { name: /执行任务/ }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.full-sync', { country: 'usa', pages: [3, 4], batchId: incomplete.batchId }, {}));
});

test('blocks batch tasks for pages outside the selected snapshot but keeps new capture available', async () => {
  getTaskCatalog.mockResolvedValue(readyCatalog());
  getImportGeniusBatches.mockResolvedValue({ batches: [{ ...pendingBatch, pages: [1, 2], totalPages: 2 }] });
  render(<TaskRunner />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue('1,2'));
  fireEvent.change(screen.getByRole('textbox', { name: '页码 / 范围' }), { target: { value: '3' } });
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(within(card('完整采集流程')).getByRole('button', { name: /执行任务/ })).toBeEnabled();
  await chooseOption('列表与完整流程启动方式', '续跑已有批次');
  expect(within(card('完整采集流程')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(runTask).not.toHaveBeenCalled();
});

test('country changes discard stale batch responses and never bind the previous country snapshot', async () => {
  let resolveUsa;
  getTaskCatalog.mockResolvedValue(readyCatalog());
  const india = { ...pendingBatch, country: 'india', batchId: '20261026/113025-c7f3abcd', pages: [7], totalPages: 1 };
  getImportGeniusBatches.mockImplementation(country => country === 'usa'
    ? new Promise(resolve => { resolveUsa = resolve; }) : Promise.resolve({ batches: [india] }));
  render(<TaskRunner />);
  await waitFor(() => expect(getImportGeniusBatches).toHaveBeenCalledWith('usa'));
  await chooseOption('国家 / 地区', '印度 · India');
  await waitFor(() => expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue('7'));
  await act(async () => { resolveUsa({ batches: [pendingBatch] }); });
  expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue('7');
  expect(screen.queryByText(/当前批次：20261026\/103025/)).not.toBeInTheDocument();
  fireEvent.click(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.fetch-shipments', { country: 'india', pages: [7], batchId: india.batchId }, {}));
});

test('legacy snapshots remain selectable and large batches require an explicit page subset', async () => {
  const legacy = { ...pendingBatch, batchId: 'legacy', legacy: true, createdAt: null, pages: Array.from({ length: 30 }, (_, index) => index + 1), totalPages: 30, progress: { list: 30, details: null, import: null } };
  getTaskCatalog.mockResolvedValue(readyCatalog());
  getImportGeniusBatches.mockResolvedValue({ batches: [legacy] });
  render(<TaskRunner />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue(''));
  expect(screen.getByText('历史未分批数据 · 30 页')).toBeInTheDocument();
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: '页码 / 范围' }), { target: { value: '1-2' } });
  fireEvent.click(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.fetch-shipments', { country: 'usa', pages: [1, 2], batchId: 'legacy' }, {}));
});

test('a late batch response does not overwrite a page range the user has already edited', async () => {
  let finishBatches;
  getTaskCatalog.mockResolvedValue(readyCatalog());
  getImportGeniusBatches.mockReturnValue(new Promise(resolve => { finishBatches = resolve; }));
  render(<TaskRunner />);
  await waitFor(() => expect(getImportGeniusBatches).toHaveBeenCalledWith('usa'));
  fireEvent.change(screen.getByRole('textbox', { name: '页码 / 范围' }), { target: { value: '9' } });
  await act(async () => { finishBatches({ batches: [{ ...pendingBatch, pages: [1, 2], totalPages: 2 }] }); });

  expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue('9');
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  fireEvent.click(within(card('完整采集流程')).getByRole('button', { name: /执行任务/ }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('importgenius.full-sync', { country: 'usa', pages: [9] }, {}));
});

test('a new run that fails before creating its snapshot never silently falls back to an older batch', async () => {
  const unavailableBatchId = '20261026/193025-d7f3abcd';
  getTaskCatalog.mockImplementation(async () => readyCatalog());
  getImportGeniusBatches.mockResolvedValue({ batches: [{ ...pendingBatch, pages: [1, 2], totalPages: 2 }] });
  runTask.mockImplementation(async (taskId, params) => ({
    ...activeRun, taskId, params: { ...params, batchId: unavailableBatchId }, status: 'failed', error: 'MySQL 预检失败',
  }));
  render(<TaskRunner />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: '页码 / 范围' })).toHaveValue('1,2'));
  fireEvent.click(within(card('完整采集流程')).getByRole('button', { name: /执行任务/ }));
  await screen.findByText(new RegExp(`本次新批次 ${unavailableBatchId} 尚未生成可用快照`));
  await waitFor(() => expect(getImportGeniusBatches).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/当前批次：/)).not.toBeInTheDocument();
  expect(screen.getByText(`采集批次：${unavailableBatchId}`)).toBeInTheDocument();
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(within(card('批量写入 MySQL')).getByRole('button', { name: /执行任务/ })).toBeDisabled();

  fireEvent.mouseDown(screen.getByRole('combobox', { name: '已有采集批次' }));
  fireEvent.click(await screen.findByText(/103025-a7f3abcd/, { selector: '.task-batch-option > div' }));
  expect(screen.queryByText(/本次新批次 .* 尚未生成可用快照/)).not.toBeInTheDocument();
  expect(within(card('补充 shipment 明细')).getByRole('button', { name: /执行任务/ })).toBeEnabled();
});

test.each([
  ['旧 API 返回 404', () => Promise.reject(new Error('请求失败（HTTP 404）'))],
  ['SPA fallback 返回无效的成功响应', () => Promise.resolve({})],
])('%s blocks every ImportGenius collection action without blocking database maintenance', async (_, response) => {
  const ready = readyCatalog();
  ready.tasks.push({ id: 'database.ensure-indexes', name: '盘点并补齐 ImportGenius 查询索引', group: 'ImportGenius', description: '数据库维护', latestRun: null });
  getTaskCatalog.mockResolvedValue(ready);
  getImportGeniusBatches.mockImplementation(response);
  render(<TaskRunner />);
  await screen.findByText('批次服务尚未就绪，ImportGenius 采集已停用');
  expect(screen.getByText(/请升级并重启 API 服务后刷新/)).toBeInTheDocument();

  for (const title of ['抓取 importer 列表', '完整采集流程', '补充 shipment 明细', '批量写入 MySQL']) {
    const start = within(card(title)).getByRole('button', { name: /执行任务/ });
    expect(start).toBeDisabled();
    fireEvent.click(start);
  }
  expect(runTask).not.toHaveBeenCalled();
  const maintenance = within(card('盘点并补齐 ImportGenius 查询索引')).getByRole('button', { name: /执行任务/ });
  expect(maintenance).toBeEnabled();
  fireEvent.click(maintenance);
  await waitFor(() => expect(runTask).toHaveBeenCalledWith('database.ensure-indexes', {}, {}));
});

test('collection waits for the first compatible batch response and keeps validated batches usable during refresh', async () => {
  let finishFirst;
  let failRefresh;
  getTaskCatalog.mockImplementation(async () => readyCatalog());
  getImportGeniusBatches
    .mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }))
    .mockReturnValueOnce(new Promise((_, reject) => { failRefresh = reject; }));
  render(<TaskRunner />);
  await waitFor(() => expect(getImportGeniusBatches).toHaveBeenCalledTimes(1));
  const titles = ['抓取 importer 列表', '完整采集流程', '补充 shipment 明细', '批量写入 MySQL'];
  for (const title of titles) expect(within(card(title)).getByRole('button', { name: /执行任务/ })).toBeDisabled();

  await act(async () => { finishFirst({ batches: [pendingBatch] }); });
  for (const title of titles) expect(within(card(title)).getByRole('button', { name: /执行任务/ })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /刷新状态/ }));
  await waitFor(() => expect(getImportGeniusBatches).toHaveBeenCalledTimes(2));
  for (const title of titles) expect(within(card(title)).getByRole('button', { name: /执行任务/ })).toBeEnabled();

  await act(async () => { failRefresh(new Error('请求失败（HTTP 404）')); });
  for (const title of titles) expect(within(card(title)).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(runTask).not.toHaveBeenCalled();
});
