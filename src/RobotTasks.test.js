import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RobotTasks from './RobotTasks';
import { getTaskCatalog, getTaskRun, runTask, stopTask } from './API/tasks';

jest.mock('./API/tasks', () => ({
  getTaskCatalog: jest.fn(), getTaskRun: jest.fn(), runTask: jest.fn(), stopTask: jest.fn(),
}));

const task = (id, platform, name, overrides = {}) => ({
  id, platform, name, description: `${name}，读取已有名单并按固定流程处理。`, group: '客户开发',
  readOnly: false, supported: true, available: true, batchLimit: 20, sourceScript: 'facebook/chat.js',
  inputs: ['固定名单和历史标记'], outputs: ['写入处理结果与日志'], steps: ['筛选候选名单', '核对页面结果后更新状态'],
  effects: ['向真实账号提交私信', '更新本地处理标记'], prerequisites: ['浏览器已登录正确账号'], limitations: ['流程结束不等于客户回复'],
  latestRun: null, ...overrides,
});
const facebook = task('robot.facebook.chat', 'facebook', 'Facebook 发送首轮客户开发私信');
const instagram = task('robot.instagram.expand', 'instagram', 'Instagram 扩展名单并执行关注', { sourceScript: 'ig/IGApp.js', inputs: ['Instagram 种子名单'], effects: ['关注候选账号'] });
const inspect = task('robot.inspect', 'tools', '只读检查客户名单', { readOnly: true, sourceScript: '', effects: ['只读取本地名单'] });
const activeRun = { taskId: facebook.id, runId: 'robot-run-1', status: 'running', startedAt: '2026-10-25T01:00:00Z', logs: [], logId: 'robot-log-1' };

function catalog(overrides = {}) {
  return {
    environment: 'local', productionControlConfigured: false, activeRunId: null,
    robot: { available: true, root: '/fixed/my-robot', error: '' },
    tasks: [facebook, instagram, inspect, { id: 'database.inspect', name: '其他任务', group: '数据库' }],
    ...overrides,
  };
}
function renderPage() { return render(<MemoryRouter><RobotTasks /></MemoryRouter>); }
function card(name = facebook.name) { return screen.getByRole('heading', { name }).closest('.robot-task-card'); }
async function ready() { await screen.findByRole('heading', { name: facebook.name }); }
function openRun(name = facebook.name) { fireEvent.click(within(card(name)).getByRole('button', { name: /执行任务/ })); }
function acknowledge() { fireEvent.click(screen.getByRole('checkbox', { name: '我已核对名单、账号与上述动作，确认执行' })); }

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: query => ({ matches: false, media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn() }) });
});
beforeEach(() => {
  jest.resetAllMocks();
  getTaskCatalog.mockResolvedValue(catalog());
  getTaskRun.mockResolvedValue(activeRun);
});
afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

test('only robot tasks appear, platform and keyword filters search actual task instructions without executing', async () => {
  renderPage();
  await ready();
  expect(screen.queryByRole('heading', { name: '其他任务' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Instagram', exact: true }));
  expect(screen.queryByRole('heading', { name: facebook.name })).not.toBeInTheDocument();
  expect(card(instagram.name)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索客户开发任务' }), { target: { value: '种子名单' } });
  expect(card(instagram.name)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索客户开发任务' }), { target: { value: '不存在的内容' } });
  expect(screen.getByText('没有匹配的任务，请调整平台或关键词。')).toBeInTheDocument();
  expect(runTask).not.toHaveBeenCalled();
  expect(stopTask).not.toHaveBeenCalled();
});

test('missing integration and unsupported tasks display concrete disabled reasons', async () => {
  getTaskCatalog.mockResolvedValue(catalog({ robot: { available: false, root: '', error: 'MY_ROBOT_ROOT 目录不存在' } }));
  renderPage();
  await ready();
  expect(within(card()).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: '读取名单诊断' })).toBeDisabled();
  expect(screen.getAllByText('MY_ROBOT_ROOT 目录不存在').length).toBeGreaterThan(0);
});

test('older backend is identified separately from an empty customer task catalog', async () => {
  getTaskCatalog.mockResolvedValue(catalog({ robot: undefined, tasks: [] }));
  renderPage();
  await screen.findByText('当前 API 未提供客户开发集成');
  expect(screen.getByText(/请更新并重启后端服务/)).toBeInTheDocument();
  expect(screen.queryByText('0 / 0 项可用')).not.toBeInTheDocument();
  expect(runTask).not.toHaveBeenCalled();
});

test('a supported integration still disables unavailable tasks and explains capability gaps', async () => {
  getTaskCatalog.mockResolvedValue(catalog({ tasks: [task('robot.tools.reset', 'tools', '重置历史标记', { supported: false, available: false, disabledReason: '会重置客户状态，尚未接入安全执行' })] }));
  renderPage();
  await screen.findByRole('heading', { name: '重置历史标记' });
  expect(within(card('重置历史标记')).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  expect(screen.getByText('会重置客户状态，尚未接入安全执行')).toBeInTheDocument();
});

test('local external actions require an effects preview and explicit acknowledgement, and submit no fake parameters', async () => {
  let finish;
  runTask.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  renderPage();
  await ready();
  openRun();
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByText('向真实账号提交私信')).toBeInTheDocument();
  const confirm = within(modal).getByRole('button', { name: '确认执行' });
  expect(confirm).toBeDisabled();
  expect(runTask).not.toHaveBeenCalled();
  acknowledge();
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(runTask).toHaveBeenCalledTimes(1);
  expect(runTask).toHaveBeenCalledWith(facebook.id, { acknowledged: true }, {});
  await act(async () => { finish(activeRun); });
  expect(await screen.findByText(/运行 ID：robot-run-1/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '打开历史详情' })).toHaveAttribute('href', '/app/task-logs?logId=robot-log-1');
});

test('production external actions require token, while readonly diagnose sends empty params without production controls', async () => {
  getTaskCatalog.mockResolvedValue(catalog({ environment: 'production', productionControlConfigured: true }));
  runTask.mockResolvedValue(activeRun);
  renderPage();
  await ready();
  openRun();
  acknowledge();
  const confirm = screen.getByRole('button', { name: '确认执行' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('生产控制令牌'), { target: { value: 'control-token' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(runTask).toHaveBeenCalledWith(facebook.id, { acknowledged: true }, { token: 'control-token', confirmed: true }));
});

test('production readonly diagnose runs without token even when production control is not configured', async () => {
  const diagnosed = { ...activeRun, taskId: inspect.id, status: 'success' };
  getTaskCatalog.mockResolvedValue(catalog({ environment: 'production', productionControlConfigured: false }));
  runTask.mockResolvedValue(diagnosed);
  getTaskRun.mockResolvedValue(diagnosed);
  renderPage();
  await ready();
  expect(within(card()).getByRole('button', { name: /执行任务/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '读取名单诊断' }));
  await waitFor(() => expect(runTask).toHaveBeenCalledWith(inspect.id, {}, {}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('start rejection remains visible and releases the submit lock for a deliberate retry', async () => {
  runTask.mockRejectedValueOnce(new Error('浏览器会话已被另一任务占用')).mockResolvedValueOnce(activeRun);
  renderPage();
  await ready();
  openRun();
  acknowledge();
  fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
  await waitFor(() => expect(screen.getAllByText('浏览器会话已被另一任务占用').length).toBeGreaterThan(0));
  const confirm = await screen.findByRole('button', { name: '确认执行' });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  await waitFor(() => expect(runTask).toHaveBeenCalledTimes(2));
});

test('stop targets its exact current run once and polls until terminal status with retained logs', async () => {
  jest.useFakeTimers();
  const stopping = { ...activeRun, status: 'stopping' };
  const stopped = { ...activeRun, status: 'stopped', durationMs: 1000, logs: [{ at: activeRun.startedAt, stream: 'stdout', text: '当前运行已终止，已发生动作请核对。' }] };
  getTaskCatalog.mockResolvedValueOnce(catalog({ activeRunId: activeRun.runId, tasks: [{ ...facebook, latestRun: activeRun }, instagram, inspect] }))
    .mockResolvedValue(catalog({ activeRunId: activeRun.runId, tasks: [{ ...facebook, latestRun: stopping }, instagram, inspect] }));
  let finish;
  stopTask.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  getTaskRun.mockResolvedValueOnce(stopping).mockResolvedValue(stopped);
  renderPage();
  await ready();
  const stop = within(card()).getByRole('button', { name: /终止任务/ });
  expect(within(card(instagram.name)).getByRole('button', { name: /终止任务/ })).toBeDisabled();
  fireEvent.click(stop);
  fireEvent.click(stop);
  expect(stopTask).toHaveBeenCalledTimes(1);
  expect(stopTask).toHaveBeenCalledWith(facebook.id, activeRun.runId, {});
  await act(async () => { finish(stopping); });
  expect(within(card()).getByRole('button', { name: /终止中/ })).toBeDisabled();
  await act(async () => { jest.advanceTimersByTime(2500); });
  expect(screen.getByText(/当前运行已终止/)).toBeInTheDocument();
  expect(within(card()).getByRole('button', { name: /执行任务/ })).toBeEnabled();
  expect(within(card()).getByRole('button', { name: /终止任务/ })).toBeDisabled();
});

test('production stop of a readonly run still requires production token and confirmation', async () => {
  const run = { ...activeRun, taskId: inspect.id };
  getTaskCatalog.mockResolvedValue(catalog({ environment: 'production', productionControlConfigured: true, activeRunId: run.runId, tasks: [{ ...inspect, latestRun: run }] }));
  stopTask.mockResolvedValue({ ...run, status: 'stopping' });
  getTaskRun.mockResolvedValue({ ...run, status: 'stopping' });
  renderPage();
  const title = await screen.findByRole('heading', { name: inspect.name });
  fireEvent.click(within(title.closest('.robot-task-card')).getByRole('button', { name: /终止任务/ }));
  const confirm = screen.getByRole('button', { name: '确认终止' });
  fireEvent.click(screen.getByRole('checkbox', { name: '我已了解终止的影响，确认终止此运行' }));
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('生产控制令牌'), { target: { value: 'stop-token' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(stopTask).toHaveBeenCalledWith(inspect.id, run.runId, { token: 'stop-token', confirmed: true }));
});

test('an older in-flight run read cannot overwrite an acknowledged stopping state', async () => {
  const stopping = { ...activeRun, status: 'stopping' };
  getTaskCatalog.mockResolvedValueOnce(catalog({ activeRunId: activeRun.runId, tasks: [{ ...facebook, latestRun: activeRun }] }))
    .mockResolvedValue(catalog({ activeRunId: activeRun.runId, tasks: [{ ...facebook, latestRun: stopping }] }));
  let finishRead;
  getTaskRun.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; })).mockResolvedValue(stopping);
  stopTask.mockResolvedValue(stopping);
  renderPage();
  await ready();
  fireEvent.click(within(card()).getByRole('button', { name: '查看运行日志' }));
  await waitFor(() => expect(getTaskRun).toHaveBeenCalledTimes(1));
  fireEvent.click(within(card()).getByRole('button', { name: /终止任务/ }));
  await waitFor(() => expect(within(card()).getByRole('button', { name: /终止中/ })).toBeDisabled());
  await act(async () => { finishRead(activeRun); });
  expect(within(card()).getByRole('button', { name: /终止中/ })).toBeDisabled();
});

test('a stale stop error refreshes terminal state without leaving a disabled pending button', async () => {
  getTaskCatalog.mockResolvedValueOnce(catalog({ activeRunId: activeRun.runId, tasks: [{ ...facebook, latestRun: activeRun }] }))
    .mockResolvedValue(catalog({ tasks: [{ ...facebook, latestRun: { ...activeRun, status: 'success' } }] }));
  stopTask.mockRejectedValue(new Error('任务已经结束'));
  renderPage();
  await ready();
  fireEvent.click(within(card()).getByRole('button', { name: /终止任务/ }));
  await screen.findByText('任务已经结束');
  await waitFor(() => expect(within(card()).getByRole('button', { name: /执行任务/ })).toBeEnabled());
  expect(within(card()).getByRole('button', { name: /终止任务/ })).toBeDisabled();
});

test('catalog errors expose a retry and never substitute sample task data', async () => {
  getTaskCatalog.mockRejectedValueOnce(new Error('API 服务未连接')).mockResolvedValue(catalog());
  renderPage();
  await screen.findByText('API 服务未连接');
  expect(screen.queryByRole('heading', { name: facebook.name })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
  await ready();
  expect(screen.queryByText('API 服务未连接')).not.toBeInTheDocument();
  expect(runTask).not.toHaveBeenCalled();
});

test('run polling pauses while hidden, resumes when visible, and retains output on read failure', async () => {
  jest.useFakeTimers();
  let visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  const latest = { ...activeRun, logs: [{ at: activeRun.startedAt, stream: 'stdout', text: '保留上次运行输出' }] };
  getTaskCatalog.mockResolvedValue(catalog({ activeRunId: activeRun.runId, tasks: [{ ...facebook, latestRun: latest }] }));
  getTaskRun.mockResolvedValueOnce(latest).mockRejectedValue(new Error('运行查询暂不可用'));
  renderPage();
  await ready();
  fireEvent.click(within(card()).getByRole('button', { name: '查看运行日志' }));
  await waitFor(() => expect(getTaskRun).toHaveBeenCalledTimes(1));
  visibility = 'hidden';
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(getTaskRun).toHaveBeenCalledTimes(1);
  visibility = 'visible';
  await act(async () => { fireEvent(document, new Event('visibilitychange')); });
  expect(getTaskRun).toHaveBeenCalledTimes(2);
  expect(screen.getByText('运行状态更新失败，当前显示上次读取结果。')).toBeInTheDocument();
  expect(screen.getByText(/保留上次运行输出/)).toBeInTheDocument();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

test('analysis distinguishes legacy snapshot counts and planned capabilities and supports platform and priority filtering', async () => {
  renderPage();
  await ready();
  fireEvent.click(screen.getByRole('tab', { name: '优化分析' }));
  expect(screen.getByText(/审计基准：2026-10-25/)).toBeInTheDocument();
  expect(screen.getByText(/旧标记矛盾 39 条/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'TikTok', exact: true }));
  expect(screen.getByRole('heading', { name: '先统一 TikTok 身份与重复记录' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '重新评估 Instagram 种子与筛选质量' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'P2 · 优化转化' }));
  expect(screen.queryByRole('heading', { name: '先统一 TikTok 身份与重复记录' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '用有效线索与回复衡量开发质量' })).toBeInTheDocument();
  expect(runTask).not.toHaveBeenCalled();
});
