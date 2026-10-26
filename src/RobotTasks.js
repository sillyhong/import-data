import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Empty, Input, Modal, Row, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { FileSearchOutlined, FileTextOutlined, ReloadOutlined, SearchOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import PageHeading from './PageHeading';
import RobotInsights from './RobotInsights';
import { getTaskCatalog, getTaskRun, runTask, stopTask } from './API/tasks';
import './RobotTasks.css';

const { Text } = Typography;
const PLATFORMS = [
  ['all', '全部平台'], ['facebook', 'Facebook'], ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'], ['email', 'Gmail 邮件'], ['tools', '诊断与工具'],
];
const PLATFORM_LABELS = Object.fromEntries(PLATFORMS);
const ACTIVE_STATUSES = ['pending', 'running', 'stopping'];
const STATUS = {
  pending: ['待启动', 'processing'], running: ['运行中', 'processing'], stopping: ['终止中', 'warning'],
  stopped: ['已终止', 'default'], success: ['流程结束', 'success'], failed: ['失败', 'error'],
  start_failed: ['启动失败', 'error'], interrupted: ['已中断', 'warning'], skipped: ['已跳过', 'warning'],
};

function StatusTag({ run }) {
  const [label, color] = STATUS[run?.status] || [run ? '状态未知' : '尚未运行', 'default'];
  return <Tag color={color}>{label}</Tag>;
}

function formatDate(value) {
  return value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
}

function InstructionList({ title, items, ordered = false }) {
  const List = ordered ? 'ol' : 'ul';
  return <div className="robot-instruction"><h4>{title}</h4>{items?.length
    ? <List>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</List>
    : <Text type="secondary">任务目录未提供此项说明。</Text>}</div>;
}

function RobotTasks() {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [platform, setPlatform] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [tab, setTab] = useState('execute');
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [token, setToken] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [inspectedRun, setInspectedRun] = useState(null);
  const [runError, setRunError] = useState('');
  const actionRef = useRef('');
  const catalogRequestRef = useRef(0);
  const runRequestRef = useRef(0);
  const inspectionRef = useRef('');
  const mountedRef = useRef(true);

  const loadCatalog = useCallback(async () => {
    const requestId = ++catalogRequestRef.current;
    setLoading(true);
    try {
      const result = await getTaskCatalog();
      if (mountedRef.current && requestId === catalogRequestRef.current) {
        setCatalog(result);
        setLoadError('');
      }
    } catch (error) {
      if (mountedRef.current && requestId === catalogRequestRef.current) setLoadError(error.message || '无法读取任务目录。');
    } finally {
      if (mountedRef.current && requestId === catalogRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadCatalog();
    return () => { mountedRef.current = false; };
  }, [loadCatalog]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') loadCatalog(); };
    const timer = window.setInterval(refresh, catalog?.activeRunId ? 4000 : 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [catalog?.activeRunId, loadCatalog]);

  const syncRun = useCallback(run => {
    if (!mountedRef.current) return;
    setInspectedRun(run);
    setRunError('');
    setCatalog(current => current ? {
      ...current,
      activeRunId: ACTIVE_STATUSES.includes(run.status) ? run.runId
        : current.activeRunId === run.runId ? null : current.activeRunId,
      tasks: (current.tasks || []).map(task => task.id === run.taskId ? { ...task, latestRun: run } : task),
    } : current);
  }, []);

  const inspectedTaskId = inspectedRun?.taskId;
  const inspectedRunId = inspectedRun?.runId;
  const inspectedActive = ACTIVE_STATUSES.includes(inspectedRun?.status);
  const refreshRun = useCallback(async () => {
    if (!inspectedTaskId || !inspectedRunId) return;
    const key = `${inspectedTaskId}/${inspectedRunId}`;
    const requestId = ++runRequestRef.current;
    try {
      const run = await getTaskRun(inspectedTaskId, inspectedRunId);
      if (mountedRef.current && inspectionRef.current === key && requestId === runRequestRef.current) syncRun({ ...run, taskId: inspectedTaskId });
    } catch (error) {
      if (mountedRef.current && inspectionRef.current === key && requestId === runRequestRef.current) setRunError(error.message || '无法更新运行状态。');
    }
  }, [inspectedTaskId, inspectedRunId, syncRun]);

  useEffect(() => {
    if (!inspectedRunId) return undefined;
    let fetching = false;
    const poll = async () => {
      if (fetching || document.visibilityState === 'hidden') return;
      fetching = true;
      await refreshRun();
      fetching = false;
    };
    poll();
    if (!inspectedActive) return undefined;
    const timer = window.setInterval(poll, 2500);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [inspectedRunId, inspectedActive, refreshRun]);

  const tasks = useMemo(() => (catalog?.tasks || []).filter(task => task.id?.startsWith('robot.')), [catalog]);
  const environment = catalog?.environment || 'unknown';
  const production = environment === 'production';
  const environmentLabel = environment === 'local' ? '本地环境' : production ? '生产环境' : '环境未配置';
  const running = Boolean(catalog?.activeRunId);
  const integration = catalog?.robot;
  const inspectTask = tasks.find(task => task.id === 'robot.inspect');
  const filteredTasks = tasks.filter(task => {
    const searchText = [task.name, task.description, PLATFORM_LABELS[task.platform], task.sourceScript,
      ...(task.inputs || []), ...(task.outputs || []), ...(task.steps || []), ...(task.effects || [])].join(' ').toLocaleLowerCase();
    return (platform === 'all' || task.platform === platform) && searchText.includes(keyword.trim().toLocaleLowerCase());
  });

  const startReason = task => {
    if (!catalog || loadError) return '请先读取可用的任务目录。';
    if (!['local', 'production'].includes(environment)) return '后端尚未配置执行环境。';
    if (!integration) return '当前 API 未提供客户开发集成，请更新并重启后端服务。';
    if (!integration.available) return integration.error || '客户开发集成尚未就绪。';
    if (task.supported === false || task.available === false) return task.disabledReason || '此任务尚未适配执行。';
    if (running) return '已有任务运行中，请等待结束或终止后再执行。';
    if (production && !task.readOnly && !catalog.productionControlConfigured) return '生产控制令牌尚未配置。';
    return '';
  };

  const selectRun = (taskId, run) => {
    runRequestRef.current += 1;
    inspectionRef.current = `${taskId}/${run.runId}`;
    setInspectedRun({ ...run, taskId });
    setRunError('');
  };

  const executeAction = async (action, control = {}) => {
    if (actionRef.current) return;
    const key = `${action.type}/${action.task.id}/${action.runId || ''}`;
    actionRef.current = key;
    setBusyAction(key);
    setActionError('');
    try {
      const run = action.type === 'stop'
        ? await stopTask(action.task.id, action.runId, control)
        : await runTask(action.task.id, action.task.readOnly ? {} : { acknowledged: true }, control);
      if (!mountedRef.current) return;
      runRequestRef.current += 1;
      inspectionRef.current = `${action.task.id}/${run.runId}`;
      syncRun({ ...run, taskId: action.task.id });
      setPendingAction(null);
      setToken('');
      setConfirmed(false);
      if (['failed', 'start_failed'].includes(run.status)) setActionError(run.error || '任务未能启动，请查看运行日志。');
      await loadCatalog();
    } catch (error) {
      if (mountedRef.current) {
        setActionError(error.message || '操作失败，请核对运行状态后重试。');
        await loadCatalog();
      }
    } finally {
      actionRef.current = '';
      if (mountedRef.current) setBusyAction('');
    }
  };

  const requestAction = (type, task, runId) => {
    if (actionRef.current) return;
    setActionError('');
    const action = { type, task, runId, environment };
    if ((type === 'run' && !task.readOnly) || (type === 'stop' && production)) {
      setPendingAction(action);
      setConfirmed(false);
      setToken('');
    } else executeAction(action);
  };

  const modalNeedsToken = production && (pendingAction?.type === 'stop' || !pendingAction?.task.readOnly);
  const pendingReason = pendingAction && (pendingAction.environment !== environment
    ? '后端环境已改变，请关闭后重新确认。'
    : pendingAction.type === 'run' ? startReason(pendingAction.task)
      : (!['local', 'production'].includes(environment) || (production && !catalog?.productionControlConfigured))
        ? '当前环境无法终止任务。' : catalog?.activeRunId !== pendingAction.runId
          ? '该运行已结束或不再是当前运行，请关闭后刷新状态。' : '');

  return (
    <div className="robot-tasks-page">
      <PageHeading eyebrow="CUSTOMER DEVELOPMENT" title="客户开发任务" description="管理客户名单拓展、社交私信与邮件跟进，执行前核对实际动作，执行后查看真实日志。" />
      {loadError && <Alert className="robot-alert" type="error" showIcon message="任务服务暂不可用" description={loadError} action={<Button onClick={loadCatalog}>重试</Button>} />}
      {actionError && <Alert className="robot-alert" type="error" showIcon message="操作未完成" description={actionError} closable onClose={() => setActionError('')} />}

      <Card className="robot-overview" bordered={false}>
        <div className="robot-overview-heading">
          <div><Text className="robot-eyebrow">当前后端</Text><h2>{environmentLabel}</h2><Text type="secondary">运行结果以当前 API 服务返回为准</Text></div>
          <Space wrap>
            <Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} onClick={loadCatalog}>刷新状态</Button>
            <Button icon={<FileSearchOutlined aria-hidden="true" />} disabled={!inspectTask || Boolean(startReason(inspectTask)) || Boolean(busyAction)} onClick={() => requestAction('run', inspectTask)}>读取名单诊断</Button>
            <Link className="robot-history-link" to="/app/task-logs?category=robot"><FileTextOutlined aria-hidden="true" /> 历史日志</Link>
          </Space>
        </div>
        <div className="robot-metrics">
          <div><Text type="secondary">客户开发集成</Text><strong><span className={`robot-availability-dot ${integration?.available ? 'is-ready' : ''}`} />{catalog ? !integration ? 'API 未提供' : integration.available ? '已就绪' : '未就绪' : '读取中'}</strong></div>
          <div><Text type="secondary">任务目录</Text><strong>{catalog ? integration ? `${tasks.filter(task => task.supported !== false && task.available !== false).length} / ${tasks.length} 项可用` : 'API 未提供' : '—'}</strong></div>
          <div><Text type="secondary">全局运行状态</Text><strong>{catalog ? running ? '1 项运行中' : '当前空闲' : '—'}</strong></div>
          <div><Text type="secondary">生产控制</Text><strong>{catalog ? production ? catalog.productionControlConfigured ? '令牌已配置' : '只读 · 未配置令牌' : environment === 'local' ? '本地操作确认' : '尚未配置' : '—'}</strong></div>
        </div>
        <div className="robot-root"><Text type="secondary">脚本目录</Text><code>{integration?.root || '尚未识别'}</code></div>
        {catalog && !integration && <Alert className="robot-inline-alert" type="warning" showIcon message="当前 API 未提供客户开发集成" description="请更新并重启后端服务，再刷新页面读取新任务目录。当前空目录不代表业务名单或任务数量为零。" />}
        {catalog && integration && !integration.available && <Alert className="robot-inline-alert" type="warning" showIcon message={integration.error || '后端未配置客户开发集成，请配置 MY_ROBOT_ROOT 并检查脚本入口。'} />}
        {catalog && !['local', 'production'].includes(environment) && <Alert className="robot-inline-alert" type="warning" showIcon message="后端未配置执行环境，任务操作已停用。" />}
        {running && <Alert className="robot-inline-alert" type="info" showIcon message="全局任务正在运行，新的任务将在运行结束后开放。" />}
      </Card>

      <Tabs className="robot-tabs" activeKey={tab} onChange={setTab} items={[{ label: '任务执行', key: 'execute' }, { label: '优化分析', key: 'insights' }]} />
      <div className="robot-toolbar">
        <div className="robot-platforms" aria-label="平台筛选">{PLATFORMS.map(([value, label]) => <Button key={value} type={platform === value ? 'primary' : 'default'} aria-pressed={platform === value} onClick={() => setPlatform(value)}>{label}</Button>)}</div>
        <Input aria-label="搜索客户开发任务" allowClear prefix={<SearchOutlined aria-hidden="true" />} placeholder={tab === 'execute' ? '搜索任务、动作或名单' : '搜索问题与优化建议'} value={keyword} onChange={event => setKeyword(event.target.value)} />
      </div>

      {tab === 'insights' ? <RobotInsights platform={platform} keyword={keyword} /> : <>
        <div className="robot-section-intro"><span>任务目录 <Text type="secondary">{filteredTasks.length} 项</Text></span><Text type="secondary">手动执行 · 启动前请展开核对处理范围</Text></div>
        {loading && !catalog ? <div className="robot-loading"><Spin tip="正在读取任务目录…" /></div>
          : !filteredTasks.length ? <Card className="robot-empty" bordered={false}><Empty description={tasks.length ? '没有匹配的任务，请调整平台或关键词。' : loadError ? '任务目录尚未读取成功。' : '当前后端未提供客户开发任务。'} /></Card>
            : <Row gutter={[16, 16]}>{filteredTasks.map(task => {
              const run = task.latestRun;
              const reason = startReason(task);
              const stopPending = run?.status === 'stopping' || busyAction === `stop/${task.id}/${run?.runId}`;
              const canStop = run?.status === 'running' && run?.runId === catalog?.activeRunId;
              return <Col xs={24} xl={12} key={task.id}><Card className="robot-task-card" bordered={false}>
                <div className="robot-card-top"><Space wrap><Tag>{PLATFORM_LABELS[task.platform] || task.platform || '其他'}</Tag><Tag color={task.readOnly ? 'cyan' : 'gold'}>{task.readOnly ? '只读诊断' : task.platform === 'tools' ? '会修改数据' : '含外部动作'}</Tag></Space><StatusTag run={run} /></div>
                <h3>{task.name}</h3><p className="robot-task-description">{task.description}</p>
                <div className="robot-task-batch"><Text type="secondary">处理范围</Text><span>{task.batchLimit == null ? '以任务流程说明为准' : `单次最多 ${task.batchLimit} 项`}</span></div>
                <details className="robot-task-instructions"><summary>查看完整说明</summary>
                  <InstructionList title="名单来源与输入" items={task.inputs} />
                  <InstructionList title="处理步骤与筛选" items={task.steps} ordered />
                  <InstructionList title="实际动作与副作用" items={task.effects} />
                  <InstructionList title="输出与完成判据" items={task.outputs} />
                  <InstructionList title="运行前置条件" items={task.prerequisites} />
                  <InstructionList title="限制与核验" items={task.limitations} />
                  {task.sourceScript && <div className="robot-source">脚本来源 <code>{task.sourceScript}</code></div>}
                </details>
                {run && <div className="robot-run-meta">最近开始：{formatDate(run.startedAt)}{run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)} 秒` : ''}</div>}
                {run?.error && <Alert className="robot-inline-alert" type="error" showIcon message={run.error} />}
                {reason && <p className="robot-disabled-reason">{reason}</p>}
                <div className="robot-card-actions">
                  <Button type="primary" icon={<ThunderboltOutlined aria-hidden="true" />} disabled={Boolean(reason) || Boolean(busyAction)} loading={busyAction === `run/${task.id}/`} onClick={() => requestAction('run', task)}>{task.readOnly ? '执行诊断' : '执行任务'}</Button>
                  <Button danger icon={<StopOutlined aria-hidden="true" />} loading={stopPending} disabled={!canStop || stopPending || Boolean(busyAction) || !['local', 'production'].includes(environment) || (production && !catalog?.productionControlConfigured)} onClick={() => requestAction('stop', task, run.runId)}>{stopPending ? '终止中' : '终止任务'}</Button>
                  {run?.runId && <Button onClick={() => selectRun(task.id, run)}>查看运行日志</Button>}
                  {run?.logId && <Link to={`/app/task-logs?logId=${encodeURIComponent(run.logId)}`}>历史详情</Link>}
                </div>
              </Card></Col>;
            })}</Row>}

        <Card className="robot-log-card" bordered={false}>
          <div className="robot-overview-heading"><div><Text className="robot-eyebrow">RUN DETAILS · ASIA/SHANGHAI</Text><h3>运行详情与日志</h3></div>{inspectedRun && <Space><StatusTag run={inspectedRun} /><Button size="small" onClick={refreshRun}>更新日志</Button></Space>}</div>
          {!inspectedRun ? <Text type="secondary">执行诊断、启动任务或选择“查看运行日志”后，在此查看输出。</Text> : <>
            <div className="robot-run-summary"><span>运行 ID：{inspectedRun.runId}</span><span>开始：{formatDate(inspectedRun.startedAt)}</span><span>结束：{formatDate(inspectedRun.finishedAt)}</span><span>耗时：{inspectedRun.durationMs == null ? '—' : `${(inspectedRun.durationMs / 1000).toFixed(1)} 秒`}</span>{inspectedRun.logId && <Link to={`/app/task-logs?logId=${encodeURIComponent(inspectedRun.logId)}`}>打开历史详情</Link>}</div>
            {runError && <Alert className="robot-inline-alert" type="warning" showIcon message="运行状态更新失败，当前显示上次读取结果。" description={runError} action={<Button size="small" onClick={refreshRun}>重试</Button>} />}
            {inspectedRun.error && <Alert className="robot-inline-alert" type="error" showIcon message={inspectedRun.error} />}
            {inspectedRun.logPersistenceError && <Alert className="robot-inline-alert" type="warning" showIcon message="历史日志写入失败" description={inspectedRun.logPersistenceError} />}
            <pre className="robot-log-output">{inspectedRun.logs?.length ? inspectedRun.logs.map(item => `[${formatDate(item.at)}] ${item.stream || 'stdout'}: ${item.text || ''}`).join('\n') : ACTIVE_STATUSES.includes(inspectedRun.status) ? '等待任务输出…' : '此运行没有可展示的输出。'}</pre>
            <p className="robot-log-note">流程结束表示脚本已退出；关注、私信和邮件预约结果仍需到平台核对。历史处理标记不代表有效客户或邮件送达。</p>
          </>}
        </Card>
      </>}

      <Modal title={pendingAction?.type === 'stop' ? '终止当前任务' : '确认执行客户开发任务'} open={Boolean(pendingAction)} okText={pendingAction?.type === 'stop' ? '确认终止' : '确认执行'} cancelText="取消" confirmLoading={Boolean(busyAction)} closable={!busyAction} maskClosable={!busyAction} keyboard={!busyAction} cancelButtonProps={{ disabled: Boolean(busyAction) }} onCancel={() => { if (!busyAction) { setPendingAction(null); setToken(''); setConfirmed(false); } }} onOk={() => { if (confirmed && !pendingReason && (!modalNeedsToken || token.trim())) executeAction(pendingAction, modalNeedsToken ? { token: token.trim(), confirmed: true } : {}); }} okButtonProps={{ danger: pendingAction?.type === 'stop', disabled: !confirmed || Boolean(pendingReason) || (modalNeedsToken && !token.trim()) }} destroyOnClose>
        <Tag color={production ? 'volcano' : 'blue'}>{environmentLabel}</Tag><h3 className="robot-modal-title">{pendingAction?.task.name}</h3>
        {pendingAction?.type === 'stop' ? <Alert type="warning" showIcon message="终止仅停止当前运行，已发生的关注、私信、邮件预约和名单修改无法撤销。" description="输出不明确时，请先到平台核对，再决定是否重试。" /> : <><p>{pendingAction?.task.description}</p><InstructionList title="本次会产生以下动作" items={pendingAction?.task.effects} /><InstructionList title="执行前需要满足" items={pendingAction?.task.prerequisites} /><Alert type="warning" showIcon message="此操作会实际生效。流程结束不代表客户回复或邮件送达；结果不明确时请先核对，避免重复触达。" /></>}
        {modalNeedsToken && <div className="robot-token"><label htmlFor="robot-control-token">生产控制令牌</label><Input.Password id="robot-control-token" value={token} onChange={event => setToken(event.target.value)} autoComplete="new-password" /></div>}
        {pendingReason && <Alert className="robot-inline-alert" type="warning" showIcon message={pendingReason} />}
        {actionError && <Alert className="robot-inline-alert" type="error" showIcon message={actionError} />}
        <Checkbox className="robot-confirm" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}>{pendingAction?.type === 'stop' ? '我已了解终止的影响，确认终止此运行' : '我已核对名单、账号与上述动作，确认执行'}</Checkbox>
      </Modal>
    </div>
  );
}

export default RobotTasks;
