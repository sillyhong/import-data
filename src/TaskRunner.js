import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Divider, Input, InputNumber, Modal, Row, Select, Space, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import { ClockCircleOutlined, DatabaseOutlined, FileTextOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined, StopOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import PageHeading from './PageHeading';
import { getImportGeniusBatches, getTaskCatalog, getTaskRun, runTask, stopTask, updateTaskScheduler } from './API/tasks';
import './TaskRunner.css';

const { Text, Paragraph } = Typography;
const COUNTRY_OPTIONS = [
  { value: 'usa', label: '美国 · USA' },
  { value: 'india', label: '印度 · India' },
  { value: 'vietnam', label: '越南 · Vietnam' },
  { value: 'argentina', label: '阿根廷 · Argentina' },
  { value: 'chile', label: '智利 · Chile' },
  { value: 'colombia', label: '哥伦比亚 · Colombia' },
  { value: 'costarica', label: '哥斯达黎加 · Costa Rica' },
  { value: 'ecuador', label: '厄瓜多尔 · Ecuador' },
  { value: 'panama', label: '巴拿马 · Panama' },
  { value: 'peru', label: '秘鲁 · Peru' },
  { value: 'paraguay', label: '巴拉圭 · Paraguay' },
  { value: 'uruguay', label: '乌拉圭 · Uruguay' },
  { value: 'venezuela', label: '委内瑞拉 · Venezuela' },
];

const TASK_HELP = {
  'importgenius.fetch-importers': '新建采集会按上海日期和唯一批次保存列表，同一天多次采集也不会覆盖历史。续跑已有批次仅补未完成的列表页，不刷新已保存的页面；要读取站点最新列表，请选择新建采集。',
  'importgenius.fetch-shipments': '使用下方选定批次的列表 JSON，仅补充该批次缺失的 shipment 明细。新批次重新采集详情，同批次续跑复用已完成结果。详情内容来自实际补抓时的站点，批次日期不代表网站的历史详情版本。',
  'importgenius.import-batch': '从选定批次读取指定页码并写入 MySQL，按公司 URL 和提单号追加去重。重复执行可继续入库；相同提单号的字段修正不属于当前追加合并规则。历史未分批数据也可显式选择。',
  'importgenius.full-sync': '新建采集会创建一个独立批次，列表、详情、入库全程使用该批次并保留 JSON。续跑需选择原批次，仅继续未完成阶段，跨日也不会改读当天其他批次。新批次重新抓取详情，不复制旧批次的 shipments。',
  'importyeti.init': '数据表用来保存公司、供应商、提单及它们的关系；索引类似书的目录，用来加快搜索和排序。本任务会创建缺失表，并为已有表补充缺失的查询索引，不会清空已有记录。大表建索引需要扫描数据，可能耗时较长并影响写入。',
  'importyeti.crawl': '采集队列保存数据库中已登记的采集目标链接及其处理状态；贸易关系指公开页面展示的公司与供应商往来。此任务使用上方的采集上限、采集深度、请求间隔和重试选项。robots.txt 是网站公布的自动抓取规则；规则禁止抓取或网站限制访问时，任务会暂停。',
  'importyeti.enrich': 'ImportInfo 是另一个展示公开货运信息的网站。提单是运输货物的单据，本任务用提单号匹配本库记录，并补充原先为空的业务字段；提单号可能被规范化，来源信息也会更新。HS 编码是海关对商品的分类编码，仅保存公开页面提供的编码，不根据描述推测。只读取填写的公司档案页面，不会遍历整个网站。',
  'importyeti.status': '估算值来自 MySQL 的表统计信息，可能与实际精确数量不同。档案队列总量包括待处理、完成、失败和受限的档案，并非剩余待采集数量。点击执行后，在“运行详情与日志”查看结果：targets 是队列档案数，entities 是公司/供应商数，shipments 是提单数。',
  'importyeti.export': 'CSV 是 Excel 等表格软件可打开的文本表格。分块导出表示按记录的唯一编号（主键），每批最多读取 1000 条提单，减少内存占用。文件写入当前后端服务的 exports/ 目录，不会自动下载到浏览器；文件名取自上方输入。',
  'database.inspect': '索引类似书的目录，用来加快查找。EXPLAIN 查询计划表示 MySQL 预计采用的查找方式，包括使用的索引和估算扫描行数。本任务分析预设的翻页、搜索、队列等查询示例，不实际执行这些业务查询或测量耗时。结果在运行日志中按 ImportGenius 和 ImportYeti 分别列出，包含 MySQL 版本、表的统计信息、索引和查询计划；不会自动创建或修复索引。',
};

function TaskHelp({ label, text }) {
  return (
    <Tooltip title={text} overlayClassName="task-help-tooltip" trigger={['hover', 'focus', 'click']}>
      <button type="button" className="task-help-trigger" aria-label={`${label}的说明`}>
        <InfoCircleOutlined aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

function parsePages(value) {
  const pages = new Set();
  for (const segment of String(value || '').split(',').map(item => item.trim()).filter(Boolean)) {
    const range = segment.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!range) throw new Error('页码格式示例：1-10 或 1,3,5。');
    const start = Number(range[1]);
    const end = Number(range[2] || range[1]);
    if (start < 1 || end < start || end - start > 19) throw new Error('每次最多选择 20 页，且页码范围需从小到大。');
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  if (!pages.size || pages.size > 20) throw new Error('请输入 1 到 20 个有效页码。');
  return [...pages].sort((a, b) => a - b);
}

function statusLabel(status) {
  return ({ running: ['运行中', 'processing'], stopping: ['终止中', 'warning'], stopped: ['已终止', 'default'], success: ['成功', 'success'], failed: ['失败', 'error'], idle: ['未运行', 'default'] })[status] || ['未知', 'default'];
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function batchLabel(batch) {
  if (batch.legacy) return `历史未分批数据 · ${batch.totalPages ?? batch.pages.length} 页`;
  const time = batch.createdAt ? new Date(batch.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : batch.batchId;
  return `${time} · ${batch.totalPages ?? batch.pages.length} 页 · ${batch.batchId.split('/').pop()}`;
}

function batchProgress(batch) {
  const total = batch.totalPages ?? batch.pages.length;
  return [['list', '列表'], ['details', '详情'], ['import', '入库']]
    .map(([key, label]) => `${label} ${batch.progress?.[key] == null ? '未知' : `${batch.progress[key]}/${total}`}`).join(' · ');
}

function defaultBatch(batches) {
  return batches.find(batch => !batch.legacy && (batch.progress?.details < (batch.totalPages ?? batch.pages.length) || batch.progress?.import < (batch.totalPages ?? batch.pages.length)))
    || batches.find(batch => !batch.legacy) || batches[0];
}

function usesExistingBatch(taskId, mode) {
  return ['importgenius.fetch-shipments', 'importgenius.import-batch'].includes(taskId)
    || (mode === 'resume' && ['importgenius.fetch-importers', 'importgenius.full-sync'].includes(taskId));
}

function isLogCleanupTask(taskId) {
  return ['tasks.cleanup-logs', 'scheduler.cleanup-logs'].includes(taskId);
}

function renderLogText(value, keyPrefix) {
  const parts = String(value || '').split(/(https?:\/\/[^\s<>"']+)/g);
  return parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;

    const match = part.match(/^(.*?)([),.;:!?}\]]*)$/);
    const candidate = match?.[1] || part;
    const trailing = match?.[2] || '';
    let url;
    try {
      url = new URL(candidate);
    } catch (_) {
      return part;
    }
    if (url.protocol !== 'https:' || !['importgenius.cn', 'www.importgenius.cn'].includes(url.hostname)) {
      return part;
    }

    return (
      <React.Fragment key={`${keyPrefix}-${index}`}>
        <a href={url.href} target="_blank" rel="noopener noreferrer">{candidate}</a>
        {trailing}
      </React.Fragment>
    );
  });
}

function TaskRunner() {
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [taskCountry, setTaskCountry] = useState('usa');
  const [pageExpression, setPageExpression] = useState('1-10');
  const [collectionMode, setCollectionMode] = useState('new');
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState('');
  const [batchCatalogReady, setBatchCatalogReady] = useState(false);
  const [pendingCreatedBatch, setPendingCreatedBatch] = useState(null);
  const batchRequestRef = useRef(0);
  const selectedBatchRef = useRef('');
  const preferredBatchRef = useRef(null);
  const pageEditedRef = useRef(false);
  const [crawlTargets, setCrawlTargets] = useState(100);
  const [crawlDepth, setCrawlDepth] = useState(2);
  const [crawlDelay, setCrawlDelay] = useState(3000);
  const [retryFailed, setRetryFailed] = useState(false);
  const [retryBlocked, setRetryBlocked] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');
  const [exportFilename, setExportFilename] = useState('importyeti-shipments.csv');
  const [taskLogRetentionDays, setTaskLogRetentionDays] = useState(30);
  const [inspectedTaskId, setInspectedTaskId] = useState('');
  const [inspectedRun, setInspectedRun] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [productionToken, setProductionToken] = useState('');
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [activeSection, setActiveSection] = useState('importgenius');
  const [stoppingRunId, setStoppingRunId] = useState('');
  const stopRequestRef = useRef('');
  const [messageApi, contextHolder] = message.useMessage();

  const selectBatch = useCallback((batch, explicit = false) => {
    const id = batch?.batchId || '';
    const changed = selectedBatchRef.current !== id;
    selectedBatchRef.current = id;
    setSelectedBatchId(id);
    if (changed && batch && (explicit || !pageEditedRef.current)) {
      pageEditedRef.current = false;
      setPageExpression(batch.pages.length <= 20 ? batch.pages.join(',') : '');
    }
  }, []);

  const loadBatches = useCallback(async () => {
    const requestId = ++batchRequestRef.current;
    setBatchesLoading(true);
    try {
      const result = await getImportGeniusBatches(taskCountry);
      if (requestId !== batchRequestRef.current) return;
      if (!result || !Array.isArray(result.batches)) throw new Error('批次接口响应无效，请重启或升级 API。');
      const entries = result.batches.filter(batch => batch.country === taskCountry);
      setBatches(entries);
      setBatchesError('');
      setBatchCatalogReady(true);
      const preferred = preferredBatchRef.current?.country === taskCountry
        ? entries.find(batch => batch.batchId === preferredBatchRef.current.batchId) : null;
      if (preferred) {
        preferredBatchRef.current = null;
        setPendingCreatedBatch(null);
      } else if (preferredBatchRef.current?.country === taskCountry) {
        setPendingCreatedBatch(preferredBatchRef.current);
        selectBatch(null);
        return;
      }
      selectBatch(preferred || entries.find(batch => batch.batchId === selectedBatchRef.current) || defaultBatch(entries));
    } catch (error) {
      if (requestId !== batchRequestRef.current) return;
      setBatches([]);
      setBatchesError(error.message || '采集批次读取失败。');
      setBatchCatalogReady(false);
      selectBatch(null);
    } finally {
      if (requestId === batchRequestRef.current) setBatchesLoading(false);
    }
  }, [taskCountry, selectBatch]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTaskCatalog();
      setCatalog(result);
      setLoadError('');
    } catch (error) {
      setLoadError(error.message || '任务服务暂不可用。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  useEffect(() => {
    if (catalog) loadBatches();
    return () => { batchRequestRef.current += 1; };
  }, [catalog, loadBatches]);

  const changeCountry = country => {
    batchRequestRef.current += 1;
    selectedBatchRef.current = '';
    preferredBatchRef.current = null;
    pageEditedRef.current = false;
    setSelectedBatchId('');
    setBatches([]);
    setBatchesError('');
    setBatchCatalogReady(false);
    setPendingCreatedBatch(null);
    setBatchesLoading(true);
    setPageExpression('1-10');
    setTaskCountry(country);
  };

  useEffect(() => {
    if (!catalog) return undefined;
    const delay = catalog.activeRunId ? 4000 : 30000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadCatalog();
    }, delay);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadCatalog();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [catalog, loadCatalog]);

  useEffect(() => {
    if (!inspectedTaskId || !inspectedRun?.runId || !['running', 'stopping'].includes(inspectedRun.status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const run = await getTaskRun(inspectedTaskId, inspectedRun.runId);
        if (!cancelled) {
          setInspectedRun(run);
          if (!['running', 'stopping'].includes(run.status)) loadCatalog();
        }
      } catch (_) { /* catalog continues to expose the latest run state */ }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') poll();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [inspectedTaskId, inspectedRun, loadCatalog]);

  const environment = catalog?.environment || 'unknown';
  const isProduction = environment === 'production';
  const environmentText = environment === 'local' ? '本地环境' : environment === 'production' ? '生产环境' : '环境未配置';
  const running = Boolean(catalog?.activeRunId);

  const executeAction = async (action, control = {}) => {
    if (action.type === 'stop') {
      if (stopRequestRef.current === action.runId) return;
      stopRequestRef.current = action.runId;
      setStoppingRunId(action.runId);
    }
    try {
      if (action.type === 'run') {
        const run = await runTask(action.taskId, action.params, control);
        if (action.taskId.startsWith('importgenius.') && run.params?.batchId && !action.params.batchId) {
          preferredBatchRef.current = { country: action.params.country, batchId: run.params.batchId };
          setPendingCreatedBatch(preferredBatchRef.current);
        }
        setInspectedTaskId(action.taskId);
        setInspectedRun(run);
        if (['failed', 'start_failed'].includes(run.status)) {
          messageApi.error(run.error || `启动失败：${action.label}`);
        } else if (run.status === 'stopped') {
          messageApi.info(`任务已取消：${action.label}`);
        } else {
          messageApi.success(run.status === 'success' ? `已完成：${action.label}` : `已启动：${action.label}`);
        }
      } else if (action.type === 'stop') {
        const run = await stopTask(action.taskId, action.runId, control);
        setInspectedTaskId(action.taskId);
        setInspectedRun(run);
        setCatalog(current => current ? {
          ...current,
          tasks: current.tasks.map(task => task.id === action.taskId ? { ...task, latestRun: run } : task),
        } : current);
        messageApi.success(run.status === 'stopping' ? '已请求终止任务，正在等待进程退出。' : `任务${statusLabel(run.status)[0]}。`);
      } else {
        await updateTaskScheduler(action.action, control);
        messageApi.success(action.action === 'start' ? '定时任务已启动。' : '定时任务已停止。');
      }
      await loadCatalog();
    } catch (error) {
      messageApi.error(error.message || '操作失败。');
      await loadCatalog();
    } finally {
      if (action.type === 'stop' && stopRequestRef.current === action.runId) {
        stopRequestRef.current = '';
        setStoppingRunId('');
      }
    }
  };

  const requestAction = action => {
    if (environment === 'unknown') return;
    const readOnlyRun = action.type === 'run' && ['importyeti.status', 'database.inspect'].includes(action.taskId);
    if (isProduction && !readOnlyRun) {
      setProductionToken('');
      setProductionConfirmed(false);
      setPendingAction(action);
      return;
    }
    executeAction(action);
  };

  const handleConfirmProduction = () => {
    if (!productionToken.trim() || !productionConfirmed) return;
    const action = pendingAction;
    setPendingAction(null);
    executeAction(action, { token: productionToken.trim(), confirmed: true });
    setProductionToken('');
    setProductionConfirmed(false);
  };

  const startTask = (taskId, label) => {
    try {
      let params = {};
      if (taskId.startsWith('importgenius.')) {
        if (!batchCatalogReady) throw new Error('批次服务尚未就绪，请重启 API 后刷新。');
        params = { country: taskCountry, pages: parsePages(pageExpression) };
        if (usesExistingBatch(taskId, collectionMode)) {
          const batch = batches.find(item => item.batchId === selectedBatchId);
          if (batchesError || !batch) throw new Error('请先选择可读取的采集批次。');
          if (params.pages.some(page => !batch.pages.includes(page))) throw new Error('所选页码必须属于当前采集批次，请调整页码范围。');
          params.batchId = batch.batchId;
        }
      }
      if (taskId === 'importyeti.crawl') params = {
        maxTargets: crawlTargets,
        maxDepth: crawlDepth,
        delayMs: crawlDelay,
        retryFailed,
        retryBlocked,
      };
      if (taskId === 'importyeti.enrich') params = { profileUrl };
      if (taskId === 'importyeti.export') params = { filename: exportFilename };
      if (isLogCleanupTask(taskId)) {
        if (!Number.isInteger(taskLogRetentionDays) || taskLogRetentionDays < 0 || taskLogRetentionDays > 3650) {
          throw new Error('保留天数需为 0 到 3650 的整数。');
        }
        params = { retentionDays: taskLogRetentionDays };
      }
      requestAction({ type: 'run', taskId, params, label });
    } catch (error) {
      messageApi.error(error.message);
    }
  };

  const tasksByGroup = useMemo(() => {
    const groups = new Map();
    for (const task of catalog?.tasks || []) {
      const tasks = groups.get(task.group) || [];
      tasks.push(task);
      groups.set(task.group, tasks);
    }
    return [...groups.entries()];
  }, [catalog]);

  const taskGroups = useMemo(() => Object.fromEntries(tasksByGroup), [tasksByGroup]);

  const scheduler = catalog?.scheduler;
  const logDirectory = catalog?.logDirectory || 'logs/tasks';
  const legacyLogDirectory = catalog?.legacyLogDirectory || 'logs/scheduler';
  const waitingForCreatedBatch = pendingCreatedBatch?.country === taskCountry;
  const selectedBatch = waitingForCreatedBatch ? null : batches.find(batch => batch.batchId === selectedBatchId);
  let batchPageError = '';
  if (selectedBatch) {
    try {
      if (parsePages(pageExpression).some(page => !selectedBatch.pages.includes(page))) batchPageError = '所选页码不属于当前批次，请从批次已有页码中选择。';
    } catch (error) { batchPageError = error.message; }
  }

  const renderTaskCards = tasks => (
    <Row gutter={[14, 14]}>
      {tasks.map(task => {
        const run = task.latestRun;
        const isLogCleanup = isLogCleanupTask(task.id);
        const [label, color] = statusLabel(run?.status || 'idle');
        const stopPending = run?.status === 'stopping' || Boolean(run?.runId && stoppingRunId === run.runId);
        const canStop = run?.status === 'running' && run.runId === catalog?.activeRunId;
        const needsBatch = usesExistingBatch(task.id, collectionMode);
        const batchUnavailable = needsBatch && (batchesError || !selectedBatch || batchPageError);
        const batchServiceUnavailable = task.id.startsWith('importgenius.') && !batchCatalogReady;
        return (
          <Col xs={24} xl={isLogCleanup ? 24 : 12} key={task.id}>
            <Card className={`task-item-card${isLogCleanup ? ' scheduler-log-card' : ''}`} bordered={false}>
              <div className="task-item-heading">
                <div>
                  <div className="task-card-title">
                    {isLogCleanup ? '任务日志' : task.name}
                    {TASK_HELP[task.id] && <TaskHelp label={task.name} text={TASK_HELP[task.id]} />}
                  </div>
                  <Text type="secondary">{isLogCleanup ? '留存手动与定时任务的执行时间、参数和输出，并按保留天数清理。' : task.description}</Text>
                </div>
                <Tag color={color}>{isLogCleanup ? `清理：${label}` : label}</Tag>
              </div>
              {isLogCleanup && (
                <Row className="scheduler-log-fields" gutter={[16, 14]} align="bottom">
                  <Col xs={24} sm={16}>
                    <Text className="task-field-label">项目内日志目录</Text>
                    <Text code>{logDirectory}</Text>
                    <div><Text type="secondary">兼容旧日志：</Text><Text code>{legacyLogDirectory}</Text></div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <label className="task-field-label" htmlFor="scheduler-log-retention-days">保留天数</label>
                    <InputNumber id="scheduler-log-retention-days" min={0} max={3650} precision={0} value={taskLogRetentionDays} onChange={value => setTaskLogRetentionDays(value ?? 30)} />
                  </Col>
                  <Col xs={24}><Text type="secondary">清理超过保留天数的已结束日志；0 清理全部已结束日志，运行中的日志保留。</Text></Col>
                </Row>
              )}
              {run && <div className="task-run-meta">最近开始：{formatDate(run.startedAt)}{run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)} 秒` : ''}</div>}
              {run?.error && <Paragraph className="task-run-error" ellipsis={{ rows: 2, tooltip: run.error }}>{run.error}</Paragraph>}
              {run?.logPersistenceError && <Alert className="task-inline-alert" type="warning" showIcon message="历史日志写入失败" description={run.logPersistenceError} />}
              <div className="task-item-actions">
                <Button
                  type="primary"
                  danger={isLogCleanup}
                  icon={<ThunderboltOutlined />}
                  disabled={environment === 'unknown' || running || batchServiceUnavailable || Boolean(batchUnavailable) || (isProduction && !catalog?.productionControlConfigured && !['importyeti.status', 'database.inspect'].includes(task.id))}
                  onClick={() => startTask(task.id, task.name)}
                >
                  {isLogCleanup ? '执行清理' : task.id === 'importyeti.status' ? '读取数据概况' : '执行任务'}
                </Button>
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={stopPending}
                  disabled={!canStop || stopPending || environment === 'unknown' || (isProduction && !catalog?.productionControlConfigured)}
                  onClick={() => requestAction({ type: 'stop', taskId: task.id, runId: run.runId, label: `终止：${task.name}` })}
                >
                  {stopPending ? '终止中' : '终止任务'}
                </Button>
                {isLogCleanup && <Button><Link to="/app/task-logs">查看历史日志</Link></Button>}
                {run?.logId && <Button><Link to={`/app/task-logs?logId=${encodeURIComponent(run.logId)}`}>历史详情</Link></Button>}
                {run && <Button onClick={() => { setInspectedTaskId(task.id); setInspectedRun(run); }}>{isLogCleanup ? '查看清理日志' : '查看运行日志'}</Button>}
              </div>
            </Card>
          </Col>
        );
      })}
    </Row>
  );

  return (
    <div className="task-runner-page">
      {contextHolder}
      <PageHeading
        eyebrow="TASK CONTROL CENTER"
        title="任务执行"
        description="集中运行采集、入库、导出任务，并查看定时器的真实运行状态。"
      />

      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" icon={<ReloadOutlined />} onClick={loadCatalog}>重试</Button>} />}
      {isProduction && !catalog?.productionControlConfigured && (
        <Alert className="task-alert" type="error" showIcon message="生产控制令牌未配置，生产环境当前只读。" description="请在服务端配置 TASK_CONTROL_TOKEN 后重启 API 服务。" />
      )}

      <Card className="task-environment-card" bordered={false}>
        <div className="task-environment-main">
          <div>
            <Text className="task-section-eyebrow">当前后端</Text>
            <div className="task-environment-title">{environmentText}</div>
            <Text type="secondary">所有任务只连接当前 API 服务配置的数据源</Text>
          </div>
          <Space>
            <Tag color={environment === 'production' ? 'volcano' : environment === 'local' ? 'blue' : 'default'}>{environmentText}</Tag>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadCatalog}>刷新状态</Button>
          </Space>
        </div>
        {environment === 'unknown' && <Alert className="task-inline-alert" type="warning" showIcon message="TASK_ENV 未配置为 local 或 production，所有任务操作已停用。" />}
      </Card>

      <Tabs className="task-workspace-tabs" activeKey={activeSection} onChange={setActiveSection}>
        <Tabs.TabPane tab={<span><TeamOutlined /> ImportGenius</span>} key="importgenius">
          <Card className="task-parameters-card" bordered={false}>
            <div className="task-card-heading">
              <div><Text className="task-section-eyebrow">IMPORTGENIUS · MANUAL RUN</Text><div className="task-card-title">手动任务参数</div></div>
              <Text type="secondary">仅用于下方手动执行，不影响定时采集</Text>
            </div>
            <Row gutter={[16, 14]} align="bottom">
              <Col xs={24} sm={12} xl={8}>
                <Text className="task-field-label">国家 / 地区</Text>
                <Select aria-label="国家 / 地区" size="large" value={taskCountry} onChange={changeCountry} options={COUNTRY_OPTIONS} />
              </Col>
              <Col xs={24} sm={12} xl={8}>
                <Text className="task-field-label">页码 / 范围</Text>
                <Input aria-label="页码 / 范围" size="large" value={pageExpression} onChange={event => { pageEditedRef.current = true; setPageExpression(event.target.value); }} placeholder={selectedBatch?.pages.length > 20 ? '请从所选批次中明确选择最多 20 页' : '1-10'} />
              </Col>
              <Col xs={24} xl={8}>
                <Text type="secondary">页码支持 1-10 或 1,3,5，单次最多 20 页</Text>
              </Col>
              <Col xs={24} sm={12} xl={8}>
                <Text className="task-field-label">列表与完整流程启动方式</Text>
                <Select
                  aria-label="列表与完整流程启动方式"
                  size="large"
                  value={collectionMode}
                  onChange={setCollectionMode}
                  options={[{ value: 'new', label: '新建采集批次' }, { value: 'resume', label: '续跑已有批次' }]}
                />
              </Col>
              <Col xs={24} sm={12} xl={16}>
                <Text className="task-field-label">已有采集批次（补详情、入库和续跑使用）</Text>
                <Select
                  aria-label="已有采集批次"
                  size="large"
                  loading={batchesLoading}
                  value={waitingForCreatedBatch ? undefined : selectedBatchId || undefined}
                  optionLabelProp="title"
                  onChange={id => { preferredBatchRef.current = null; setPendingCreatedBatch(null); selectBatch(batches.find(batch => batch.batchId === id), true); }}
                  options={batches.map(batch => ({
                    value: batch.batchId,
                    title: batchLabel(batch),
                    label: <div className="task-batch-option"><div>{batchLabel(batch)}</div><div className="task-batch-option-progress">{batchProgress(batch)}</div></div>,
                  }))}
                  placeholder={waitingForCreatedBatch ? '本次新批次尚未生成可用快照，请查看运行日志' : batchesLoading ? '正在读取采集批次…' : '暂无采集批次，请先新建采集列表'}
                  notFoundContent={batchesLoading ? '读取中…' : '该国家暂无采集批次'}
                />
              </Col>
              <Col xs={24}>
                <div className="task-batch-note">
                  <Text type="secondary">新建会按上海日期保存独立批次；续跑沿用原批次，跨日不换目录。补详情和入库始终使用选定批次。</Text>
                  {selectedBatch && <Text type="secondary">当前批次：{selectedBatch.batchId} · {batchProgress(selectedBatch)}</Text>}
                  {waitingForCreatedBatch && <Text type="warning">本次新批次 {pendingCreatedBatch.batchId} 尚未生成可用快照，可能仍在预检或已提前失败，请查看运行日志。需要处理其他历史数据时，请从下拉明确选择已有批次。</Text>}
                  {selectedBatch?.pages.length > 20 && <Text type="secondary">本批次共有 {selectedBatch.pages.length} 页，请明确填写其中最多 20 页；不会自动截取。</Text>}
                  {batchPageError && <Text type="warning">{batchPageError} 新建采集仍使用填写的页码。</Text>}
                  {!batchesLoading && !batchesError && !selectedBatch && !waitingForCreatedBatch && <Text type="secondary">补详情、入库及续跑需先有可选批次；“新建采集批次”可直接执行列表或完整流程。</Text>}
                </div>
              </Col>
            </Row>
            {batchesError && <Alert className="task-inline-alert" type="warning" showIcon message="批次服务尚未就绪，ImportGenius 采集已停用" description={`请升级并重启 API 服务后刷新，确认后端已支持采集批次，避免旧版本覆盖历史 JSON。当前错误：${batchesError}`} action={<Button size="small" onClick={loadBatches}>重新读取批次</Button>} />}
          </Card>
          <section className="task-group">
            <div className="task-group-heading">
              <Text strong>ImportGenius 手动任务</Text>
              <Tooltip
                overlayClassName="task-flow-tooltip"
                title={(
                  <div className="task-flow-tooltip-content">
                    <strong>采集批次与续跑</strong>
                    <ul>
                      <li>新采集按日期和唯一批次保存，历史列表不覆盖</li>
                      <li>同一批次续跑只补未完成阶段，新批次重新采集详情</li>
                      <li>补详情、入库均读取选定批次；旧版平铺 JSON 标为历史未分批数据</li>
                    </ul>
                    <strong>批量写入 MySQL</strong>
                    <ul>
                      <li>写入或合并 <code>importgenius.raw</code></li>
                      <li>MySQL 从 <code>raw</code> 自动计算 <code>product_description_generated</code></li>
                      <li>搜索侧表存在时，同步新增或更新的商品描述</li>
                    </ul>
                    <strong>盘点并补齐 ImportGenius 查询索引</strong>
                    <ul>
                      <li>从 <code>importgenius.raw</code> 分批回填历史描述到 <code>importgenius_search</code></li>
                      <li>保存回填检查点，任务可续跑</li>
                      <li>回填完成后创建全文索引；同时检查 ImportYeti 查询索引</li>
                    </ul>
                  </div>
                )}
              >
                <InfoCircleOutlined className="task-group-help" aria-label="查看 ImportGenius 数据流说明" />
              </Tooltip>
              <Text type="secondary">{(taskGroups.ImportGenius || []).length} 项</Text>
            </div>
            {renderTaskCards(taskGroups.ImportGenius || [])}
          </section>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><SearchOutlined /> ImportYeti</span>} key="importyeti">
          <Card className="task-parameters-card" bordered={false}>
            <div className="task-card-heading">
              <div><Text className="task-section-eyebrow">IMPORTYETI · MANUAL RUN</Text><div className="task-card-title">手动任务参数</div></div>
              <Text type="secondary">仅用于下方手动执行</Text>
            </div>
            <Row gutter={[16, 14]} align="bottom">
              <Col xs={24} sm={12} xl={8}>
                <Text className="task-field-label">
                  单次采集上限（档案数）
                  <TaskHelp label="单次采集上限" text="仅用于采集档案任务。100 表示本次最多处理 100 次公司或供应商档案，失败尝试也计入上限，并非成功新增 100 条提单。队列中没有可处理档案或遇到网站限制时会提前结束。" />
                </Text>
                <InputNumber size="large" min={1} max={1000} value={crawlTargets} onChange={value => setCrawlTargets(value || 1)} />
              </Col>
              <Col xs={24} sm={12} xl={8}>
                <Text className="task-field-label">
                  采集深度
                  <TaskHelp label="采集深度" text="仅用于采集档案任务。从最初加入队列的档案向外查找贸易伙伴：0 只访问起始档案；1 可访问直接关联的公司或供应商；2 再向外扩展一层。实际读取队列中深度不超过该值的档案，仍受单次采集上限限制。" />
                </Text>
                <InputNumber size="large" min={0} max={5} value={crawlDepth} onChange={value => setCrawlDepth(value ?? 0)} />
              </Col>
              <Col xs={24} sm={12} xl={8}>
                <Text className="task-field-label">
                  请求间隔（毫秒）
                  <TaskHelp label="请求间隔" text="仅用于采集档案任务，控制处理相邻档案之间的等待时间。1000 毫秒等于 1 秒，例如 3000 表示等待 3 秒；当前最低为 2000 毫秒。间隔越长，整体采集所需时间越长。" />
                </Text>
                <InputNumber size="large" min={2000} max={60000} step={500} value={crawlDelay} onChange={value => setCrawlDelay(value || 2000)} />
              </Col>
              <Col xs={24} sm={12} xl={12}>
                <Text className="task-field-label">
                  ImportInfo 公司档案链接
                  <TaskHelp label="ImportInfo 公司档案链接" text="仅用于“用 ImportInfo 补充匹配提单”。填写 ImportInfo 的公司公开档案链接，例如 https://www.importinfo.com/company-name；只读取该页面公开的舱单并匹配本库已有提单，不接受搜索页或 ImportYeti 链接。" />
                </Text>
                <Input size="large" value={profileUrl} onChange={event => setProfileUrl(event.target.value)} placeholder="https://www.importinfo.com/company-name" />
              </Col>
              <Col xs={24} sm={12} xl={12}>
                <Text className="task-field-label">
                  导出文件名
                  <TaskHelp label="导出文件名" text="仅用于“分块导出 CSV”。填写以 .csv 结尾的文件名，可用英文字母、数字、点、下划线和连字符；文件会保存到当前后端服务的 exports/ 目录。相同文件名会覆盖原导出文件。" />
                </Text>
                <Input size="large" value={exportFilename} onChange={event => setExportFilename(event.target.value)} />
              </Col>
              <Col xs={24}>
                <Space wrap>
                  <span>
                    <Checkbox checked={retryFailed} onChange={event => setRetryFailed(event.target.checked)}>重试采集失败的档案</Checkbox>
                    <TaskHelp label="重试采集失败的档案" text="仅用于采集档案任务。勾选后，将队列中标记为失败的档案也纳入本次尝试，仍受采集上限、深度和重试等待时间限制；不勾选时跳过标记为失败的档案。" />
                  </span>
                  <span>
                    <Checkbox checked={retryBlocked} onChange={event => setRetryBlocked(event.target.checked)}>重试被网站限制的档案</Checkbox>
                    <TaskHelp label="重试被网站限制的档案" text="仅用于采集档案任务。勾选后，将之前因网站拒绝访问、访问频率限制或抓取规则而暂停的档案也纳入本次尝试。仍会遵守网站规则，再次受限时暂停；不保证能够恢复采集。" />
                  </span>
                </Space>
              </Col>
            </Row>
          </Card>
          <section className="task-group">
            <div className="task-group-heading"><Text strong>ImportYeti 手动任务</Text><Text type="secondary">{(taskGroups.ImportYeti || []).length} 项</Text></div>
            {renderTaskCards(taskGroups.ImportYeti || [])}
          </section>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><DatabaseOutlined /> 数据库</span>} key="database">
          <section className="task-group">
            <div className="task-group-heading"><Text strong>数据库维护任务</Text><Text type="secondary">{(taskGroups.数据库 || []).length} 项</Text></div>
            {renderTaskCards(taskGroups.数据库 || [])}
          </section>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><ClockCircleOutlined /> 定时任务</span>} key="scheduler">
          <Card className="scheduler-card" bordered={false}>
            <div className="task-card-heading">
              <div>
                <Text className="task-section-eyebrow">SCHEDULER</Text>
                <div className="task-card-title">ImportGenius 周采集</div>
                <Text type="secondary">每周日 00:00 · Asia/Shanghai · 生产启动时自动启用，本地默认关闭</Text>
                <div><Text type="secondary">定时采集使用独立计划，不读取手动任务参数。</Text></div>
                <div><Text type="secondary">每次周采集新建独立批次，列表、详情和入库共用该批次，保留历史 JSON；失败后可在手动任务中选择原批次续跑。</Text></div>
                <div><Text type="secondary">批次日期是列表采集时间，补抓详情记录实际执行时的站点内容。</Text></div>
              </div>
              <Tag color={scheduler?.enabled ? 'success' : 'default'}>{scheduler?.enabled ? '定时已启用' : '定时已停止'}</Tag>
            </div>
            <Divider />
            <Row gutter={[20, 12]}>
              <Col xs={24} sm={12} xl={6}><Text type="secondary">Cron / 时区</Text><div className="task-metric">{scheduler?.cron || '—'} · {scheduler?.timezone || '—'}</div></Col>
              <Col xs={24} sm={12} xl={6}><Text type="secondary">下次触发</Text><div className="task-metric">{scheduler?.nextRunAt ? formatDate(scheduler.nextRunAt) : '—'}</div></Col>
              <Col xs={24} sm={12} xl={6}><Text type="secondary">上次触发</Text><div className="task-metric">{formatDate(scheduler?.lastTriggeredAt)}</div></Col>
              <Col xs={24} sm={12} xl={6}><Text type="secondary">上次运行 / 当前状态</Text><div className="task-metric">{scheduler?.running ? '运行中' : (scheduler?.lastRunStatus || '尚未运行')}</div></Col>
            </Row>
            {scheduler?.lastError && <Alert className="task-inline-alert" type="warning" showIcon message={scheduler.lastError} />}
            <div className="task-scheduler-actions">
              <Button type={scheduler?.enabled ? 'default' : 'primary'} disabled={environment === 'unknown' || (isProduction && !catalog?.productionControlConfigured)} onClick={() => requestAction({ type: 'scheduler', action: scheduler?.enabled ? 'stop' : 'start', label: scheduler?.enabled ? '停止定时任务' : '启动定时任务' })}>
                {scheduler?.enabled ? '停止定时任务' : '启动定时任务'}
              </Button>
              {running && <Tag color="processing">手动任务执行中 · {catalog?.activeRunId}</Tag>}
            </div>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><FileTextOutlined /> 日志管理</span>} key="logs">
          {renderTaskCards(taskGroups['任务日志'] || taskGroups['定时器日志'] || [])}
        </Tabs.TabPane>
      </Tabs>

      <Card className="task-log-card" bordered={false}>
        <div className="task-card-heading">
          <div><Text className="task-section-eyebrow">LATEST RUN</Text><div className="task-card-title">运行详情与日志</div></div>
          {inspectedRun && <Tag color={statusLabel(inspectedRun.status)[1]}>{statusLabel(inspectedRun.status)[0]}</Tag>}
        </div>
        {!inspectedRun ? <Text type="secondary">启动任务后，在此查看运行状态、耗时与最近输出。</Text> : (
          <>
            <div className="task-run-summary">
              <span>运行 ID：{inspectedRun.runId}</span>
              {inspectedRun.params?.batchId && <span>采集批次：{inspectedRun.params.batchId === 'legacy' ? '历史未分批数据' : inspectedRun.params.batchId}</span>}
              <span>开始：{formatDate(inspectedRun.startedAt)}</span>
              <span>结束：{formatDate(inspectedRun.finishedAt)}</span>
              <span>耗时：{inspectedRun.durationMs == null ? '—' : `${(inspectedRun.durationMs / 1000).toFixed(1)} 秒`}</span>
              {inspectedRun.logId && <Link to={`/app/task-logs?logId=${encodeURIComponent(inspectedRun.logId)}`}>历史详情</Link>}
            </div>
            <pre className="task-log-output">
              {(inspectedRun.logs || []).length
                ? inspectedRun.logs.map((item, index) => (
                  <React.Fragment key={`${item.at}-${index}`}>
                    [{formatDate(item.at)}] {item.stream}: {renderLogText(item.text, `log-${index}`)}
                    {index < inspectedRun.logs.length - 1 ? '\n' : ''}
                  </React.Fragment>
                ))
                : '等待任务输出…'}
            </pre>
          </>
        )}
      </Card>

      <Modal
        title="生产环境操作确认"
        visible={Boolean(pendingAction)}
        okText={pendingAction?.type === 'stop' ? '确认终止' : '确认执行'}
        cancelText="取消"
        onCancel={() => { setPendingAction(null); setProductionToken(''); setProductionConfirmed(false); }}
        onOk={handleConfirmProduction}
        okButtonProps={{ danger: pendingAction?.type === 'stop' || isLogCleanupTask(pendingAction?.taskId), disabled: !productionToken.trim() || !productionConfirmed }}
        destroyOnClose
      >
        <Alert className="task-modal-warning" type="warning" showIcon message={`即将在生产环境执行：${pendingAction?.label || pendingAction?.taskId || '任务操作'}`} description={pendingAction?.type === 'stop' ? '将终止所选任务的当前运行进程，已保存的数据与日志保留。' : isLogCleanupTask(pendingAction?.taskId) ? `将清理 ${logDirectory} 及旧目录 ${legacyLogDirectory} 中${pendingAction.params.retentionDays === 0 ? '全部' : `超过 ${pendingAction.params.retentionDays} 天的`}已结束日志，运行中的日志保留。` : '此操作连接当前生产服务器配置的数据源。数据库写入、索引构建、外部抓取和定时器启停均会真实生效。'} />
        <Text className="task-field-label">TASK_CONTROL_TOKEN</Text>
        <Input.Password value={productionToken} onChange={event => setProductionToken(event.target.value)} autoComplete="new-password" />
        <Checkbox className="task-production-checkbox" checked={productionConfirmed} onChange={event => setProductionConfirmed(event.target.checked)}>
          我已确认在生产环境执行此操作
        </Checkbox>
      </Modal>
    </div>
  );
}

export default TaskRunner;
