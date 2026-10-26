import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Input, Row, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { DownOutlined, ReloadOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import moment from 'moment';
import 'moment/locale/zh-cn';
import datePickerLocale from 'antd/es/date-picker/locale/zh_CN';
import { useSearchParams } from 'react-router-dom';
import PageHeading from './PageHeading';
import DataPagination from './DataPagination';
import { getTaskLogs, getTaskLog, getTaskLogOutput } from './API/taskLogs';
import './SchedulerLogs.css';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const STATUSES = {
  pending: ['待启动', 'default'], running: ['运行中', 'processing'], stopping: ['终止中', 'warning'],
  success: ['成功', 'success'], failed: ['失败', 'error'], stopped: ['已终止', 'default'],
  skipped: ['已跳过', 'warning'], start_failed: ['启动失败', 'error'], interrupted: ['已中断', 'warning'],
};
const CATEGORIES = [
  { value: 'importgenius', label: 'ImportGenius' }, { value: 'importyeti', label: 'ImportYeti' },
  { value: 'robot', label: '客户开发' },
  { value: 'database', label: '数据库' }, { value: 'maintenance', label: '任务维护' }, { value: 'other', label: '其他' },
];
const COUNTRY_LABELS = {
  usa: '美国', india: '印度', vietnam: '越南', argentina: '阿根廷', chile: '智利', colombia: '哥伦比亚',
  costarica: '哥斯达黎加', ecuador: '厄瓜多尔', panama: '巴拿马', peru: '秘鲁', paraguay: '巴拉圭',
  uruguay: '乌拉圭', venezuela: '委内瑞拉',
};
const TRIGGER_TYPES = [{ value: 'manual', label: '手动执行' }, { value: 'scheduled', label: '定时执行' }];
const emptyFilters = () => ({ keyword: '', category: undefined, status: undefined, triggerType: undefined, dates: null, environment: undefined, taskId: undefined, country: undefined, runId: '' });
const emptyResult = { items: [], total: 0, facets: {}, invalidRecords: 0 };

function formatDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function duration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const seconds = Math.max(0, Number(value)) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`;
}

function StatusTag({ value }) {
  const [label, color] = Object.prototype.hasOwnProperty.call(STATUSES, value) ? STATUSES[value] : [value || '未知', 'default'];
  return <Tag color={color}>{label}</Tag>;
}

function countryName(value) {
  return Object.prototype.hasOwnProperty.call(COUNTRY_LABELS, value) ? COUNTRY_LABELS[value] : value;
}

function triggerTypeName(value) {
  return value === 'manual' ? '手动执行' : !value || value === 'scheduled' ? '定时执行' : value;
}

function SchedulerLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('logId') || '';
  const [draft, setDraft] = useState(() => ({ ...emptyFilters(), category: searchParams.get('category') === 'robot' ? 'robot' : undefined }));
  const [moreFilters, setMoreFilters] = useState(false);
  const [query, setQuery] = useState(() => ({ filters: searchParams.get('category') === 'robot' ? { category: 'robot' } : {}, page: 1, pageSize: 20, revision: 0 }));
  const [result, setResult] = useState(emptyResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [record, setRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);
  const [outputDraft, setOutputDraft] = useState({ stream: 'all', keyword: '' });
  const [outputFilters, setOutputFilters] = useState({ stream: 'all', keyword: '' });
  const [outputRevision, setOutputRevision] = useState(0);
  const [output, setOutput] = useState({ items: [], nextCursor: null, hasMore: false });
  const [outputLoading, setOutputLoading] = useState(false);
  const [outputError, setOutputError] = useState('');
  const outputRequest = useRef(null);
  const outputSequence = useRef(0);
  const lastOutputRequest = useRef({ cursor: '', append: false });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getTaskLogs({ ...query.filters, page: query.page, pageSize: query.pageSize }, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        const total = Number(data.total || 0);
        const lastPage = Math.max(1, Math.ceil(total / query.pageSize));
        if (query.page > lastPage) {
          setQuery(current => ({ ...current, page: lastPage }));
          return;
        }
        setResult({ ...data, items: data.items || [], total, facets: data.facets || {} });
      })
      .catch(requestError => {
        if (controller.signal.aborted) return;
        setError(requestError.message || '任务日志加载失败。');
        setResult(current => ({ ...current, items: [], total: 0 }));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    setRecord(null);
    setDetailLoading(true);
    setDetailError('');
    getTaskLog(selectedId, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setRecord(data); })
      .catch(requestError => { if (!controller.signal.aborted) setDetailError(requestError.message || '日志详情加载失败。'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, detailRevision]);

  const loadOutput = useCallback(async ({ cursor = '', append = false } = {}) => {
    if (!selectedId) return;
    outputRequest.current?.abort();
    const controller = new AbortController();
    outputRequest.current = controller;
    const sequence = ++outputSequence.current;
    lastOutputRequest.current = { cursor, append };
    setOutputLoading(true);
    setOutputError('');
    if (!append) setOutput({ items: [], nextCursor: null, hasMore: false });
    try {
      const data = await getTaskLogOutput(selectedId, { ...outputFilters, cursor, limit: 200 }, { signal: controller.signal });
      if (controller.signal.aborted || sequence !== outputSequence.current) return;
      setOutput(current => ({
        items: append ? [...current.items, ...(data.items || [])] : (data.items || []),
        nextCursor: data.nextCursor || null,
        hasMore: Boolean(data.hasMore),
      }));
    } catch (requestError) {
      if (controller.signal.aborted || sequence !== outputSequence.current) return;
      setOutputError(requestError.message || '执行输出加载失败。');
    } finally {
      if (!controller.signal.aborted && sequence === outputSequence.current) setOutputLoading(false);
    }
  }, [selectedId, outputFilters]);

  useEffect(() => {
    loadOutput();
    return () => outputRequest.current?.abort();
  }, [loadOutput, outputRevision]);

  const updateDraft = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const refreshList = () => setQuery(current => ({ ...current, revision: current.revision + 1 }));
  const search = event => {
    event.preventDefault();
    const { dates, keyword, runId, ...filters } = draft;
    setQuery(current => ({
      ...current, page: 1, revision: current.revision + 1,
      filters: {
        ...filters, keyword: keyword.trim(), runId: runId.trim(),
        ...(dates?.[0] && dates?.[1] ? {
          from: new Date(`${dates[0].format('YYYY-MM-DD')}T00:00:00+08:00`).toISOString(),
          to: new Date(`${dates[1].clone().add(1, 'day').format('YYYY-MM-DD')}T00:00:00+08:00`).toISOString(),
        } : {}),
      },
    }));
  };
  const reset = () => {
    setDraft(emptyFilters());
    setQuery(current => ({ ...current, page: 1, filters: {}, revision: current.revision + 1 }));
  };
  const openDetail = item => {
    outputRequest.current?.abort();
    setRecord(null);
    setDetailError('');
    setOutputError('');
    setOutput({ items: [], nextCursor: null, hasMore: false });
    setOutputDraft({ stream: 'all', keyword: '' });
    setOutputFilters({ stream: 'all', keyword: '' });
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('logId', item.id);
      return next;
    });
    setDetailRevision(current => current + 1);
  };
  const closeDetail = () => {
    outputRequest.current?.abort();
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.delete('logId');
      return next;
    }, { replace: true });
    setRecord(null);
    setOutput({ items: [], nextCursor: null, hasMore: false });
  };
  const refreshDetail = () => {
    setDetailRevision(current => current + 1);
    setOutputRevision(current => current + 1);
  };
  const searchOutput = event => {
    event.preventDefault();
    setOutputFilters({ stream: outputDraft.stream, keyword: outputDraft.keyword.trim() });
  };
  const facets = result.facets;
  const today = moment.utc().utcOffset(8).startOf('day');
  const columns = [
    { title: '触发时间（上海）', dataIndex: 'triggeredAt', width: 175, render: formatDate },
    { title: '任务 / 分类', key: 'task', width: 230, render: (_, item) => <><Text strong>{item.taskName || item.taskId || '未知任务'}</Text><div className="scheduler-log-cell-secondary">{item.categoryLabel || item.category || '其他'} · {item.taskId || '—'}</div></> },
    { title: '环境', dataIndex: 'environment', width: 90, render: value => <Tag color={value === 'production' ? 'volcano' : value === 'local' ? 'blue' : 'default'}>{value === 'production' ? '生产' : value === 'local' ? '本地' : value || '未知'}</Tag> },
    { title: '状态', dataIndex: 'status', width: 100, render: value => <StatusTag value={value} /> },
    { title: '触发方式', dataIndex: 'triggerType', width: 110, render: value => <Tag color={value === 'manual' ? 'blue' : 'purple'}>{triggerTypeName(value)}</Tag> },
    { title: '国家 / 地区', dataIndex: 'countries', width: 160, render: values => <div className="scheduler-log-cell-clamp" title={(values || []).map(countryName).join('、')}>{(values || []).map(countryName).join('、') || '—'}</div> },
    { title: '耗时', dataIndex: 'durationMs', width: 115, render: duration },
    { title: '错误摘要', dataIndex: 'error', width: 240, render: (value, item) => <div className="scheduler-log-cell-clamp" title={value || item.logPersistenceError || ''}>{value || item.logPersistenceError || '—'}</div> },
    { title: '操作', key: 'action', width: 108, fixed: 'right', render: (_, item) => <Button type="link" size="small" onClick={() => openDetail(item)}>查看详情</Button> },
  ];

  return (
    <div className="scheduler-logs-page">
      <PageHeading compact title="任务日志" />
      <Card className="filter-panel scheduler-log-filters" bordered={false}>
        <form onSubmit={search}>
          <Row gutter={[12, 10]}>
            <Col xs={24} sm={12} lg={5}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-keyword">关键词</label><Input id="scheduler-log-keyword" allowClear maxLength={200} placeholder="任务 / 参数 / 错误关键词" value={draft.keyword} onChange={event => updateDraft('keyword', event.target.value)} /></div></Col>
            <Col xs={12} sm={6} lg={4}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-category">分类</label><Select id="scheduler-log-category" allowClear placeholder="全部分类" value={draft.category} options={facets.categories?.length ? facets.categories : CATEGORIES} onChange={value => updateDraft('category', value)} /></div></Col>
            <Col xs={12} sm={6} lg={4}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-status">执行状态</label><Select id="scheduler-log-status" allowClear placeholder="全部状态" value={draft.status} options={Object.entries(STATUSES).map(([value, [label]]) => ({ value, label }))} onChange={value => updateDraft('status', value)} /></div></Col>
            <Col xs={12} sm={6} lg={4}><div className="filter-field"><label className="filter-label" htmlFor="task-log-trigger-type">触发方式</label><Select id="task-log-trigger-type" allowClear placeholder="全部方式" value={draft.triggerType} options={TRIGGER_TYPES} onChange={value => updateDraft('triggerType', value)} /></div></Col>
            <Col xs={24} sm={18} lg={7}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-dates">触发日期（Asia/Shanghai）</label><RangePicker id="scheduler-log-dates" locale={datePickerLocale} format="YYYY-MM-DD" placeholder={['开始日期', '结束日期']} value={draft.dates} onChange={value => updateDraft('dates', value)} ranges={{ 今天: [today.clone(), today.clone()], 最近7天: [today.clone().subtract(6, 'days'), today.clone()], 最近30天: [today.clone().subtract(29, 'days'), today.clone()] }} /></div></Col>
          </Row>
          {moreFilters && <Row className="scheduler-log-more-fields" gutter={[12, 10]}>
            <Col xs={12} md={5}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-environment">执行环境</label><Select id="scheduler-log-environment" allowClear placeholder="全部环境" value={draft.environment} options={facets.environments?.length ? facets.environments : [{ value: 'local', label: '本地' }, { value: 'production', label: '生产' }]} onChange={value => updateDraft('environment', value)} /></div></Col>
            <Col xs={24} md={7}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-task">具体任务</label><Select id="scheduler-log-task" showSearch allowClear optionFilterProp="label" placeholder="全部任务" value={draft.taskId} options={facets.tasks || []} onChange={value => updateDraft('taskId', value)} /></div></Col>
            <Col xs={12} md={5}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-country">国家 / 地区</label><Select id="scheduler-log-country" showSearch allowClear optionFilterProp="label" placeholder="全部国家" value={draft.country} options={(facets.countries || []).map(option => ({ ...option, label: countryName(option.value) }))} onChange={value => updateDraft('country', value)} /></div></Col>
            <Col xs={24} md={7}><div className="filter-field"><label className="filter-label" htmlFor="scheduler-log-run-id">运行 ID</label><Input id="scheduler-log-run-id" allowClear maxLength={100} placeholder="支持输入部分 ID" value={draft.runId} onChange={event => updateDraft('runId', event.target.value)} /></div></Col>
          </Row>}
          <div className="scheduler-log-filter-actions">
            <Space wrap><Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>查询</Button><Button onClick={reset}>重置</Button><Button icon={<ReloadOutlined />} onClick={refreshList} disabled={loading}>刷新</Button></Space>
            <Button type="link" icon={moreFilters ? <UpOutlined /> : <DownOutlined />} onClick={() => setMoreFilters(value => !value)}>{moreFilters ? '收起筛选' : '更多筛选'}</Button>
          </div>
        </form>
      </Card>
      {error && <Alert className="scheduler-log-alert" type="error" showIcon message={error} action={<Button size="small" onClick={refreshList}>重试</Button>} />}
      {result.invalidRecords > 0 && <Alert className="scheduler-log-alert" type="warning" showIcon message={`有 ${result.invalidRecords} 个日志文件无法读取，未计入查询结果。`} />}
      <Card className="table-panel" bordered={false}>
        <div className="table-panel-heading"><Text strong>执行记录</Text><span className="result-count">按触发时间倒序 · 共 {result.total.toLocaleString()} 条</span></div>
        <Table columns={columns} dataSource={result.items} rowKey="id" pagination={false} loading={loading} size="small" scroll={{ x: 1428 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? '日志加载失败，请重试' : Object.values(query.filters).some(Boolean) ? '没有符合筛选条件的执行记录' : '暂无任务日志，手动或定时任务执行后会记录在这里'} /> }} />
        <DataPagination current={query.page} pageSize={query.pageSize} total={result.total} disabled={loading} onChange={(page, pageSize) => setQuery(current => ({ ...current, page: pageSize === current.pageSize ? page : 1, pageSize }))} />
      </Card>

      <Drawer className="scheduler-log-drawer" title="任务执行详情" placement="right" width="min(960px, 100vw)" visible={Boolean(selectedId)} onClose={closeDetail} extra={<Button icon={<ReloadOutlined />} onClick={refreshDetail} disabled={detailLoading || outputLoading}>刷新</Button>}>
        {detailError && <Alert className="scheduler-log-alert" type="error" showIcon message={detailError} action={<Button size="small" onClick={refreshDetail}>重试</Button>} />}
        <Spin spinning={detailLoading}>
          {record && <>
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="任务">{record.taskName || record.taskId || '—'}</Descriptions.Item><Descriptions.Item label="状态"><StatusTag value={record.status} /></Descriptions.Item>
              <Descriptions.Item label="分类">{record.categoryLabel || record.category || '—'}</Descriptions.Item><Descriptions.Item label="环境">{record.environment === 'production' ? '生产' : record.environment === 'local' ? '本地' : record.environment || '—'}</Descriptions.Item>
              <Descriptions.Item label="触发方式" span={2}>{triggerTypeName(record.triggerType)}</Descriptions.Item>
              <Descriptions.Item label="触发时间">{formatDate(record.triggeredAt)}</Descriptions.Item><Descriptions.Item label="开始时间">{formatDate(record.startedAt)}</Descriptions.Item>
              <Descriptions.Item label="结束时间">{formatDate(record.finishedAt)}</Descriptions.Item><Descriptions.Item label="耗时">{duration(record.durationMs)}</Descriptions.Item>
              <Descriptions.Item label="Cron / 时区">{record.cron || '—'} / {record.timezone || 'Asia/Shanghai'}</Descriptions.Item><Descriptions.Item label="退出码">{record.exitCode ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="任务 ID" span={2}><Text code copyable>{record.taskId || '—'}</Text></Descriptions.Item>
              <Descriptions.Item label="运行 ID" span={2}>{record.runId ? <Text code copyable>{record.runId}</Text> : '未创建运行实例'}</Descriptions.Item>
              <Descriptions.Item label="日志 ID" span={2}><Text code copyable>{record.id}</Text></Descriptions.Item>
            </Descriptions>
            {record.error && <Alert className="scheduler-log-alert scheduler-log-detail-error" type="error" showIcon message="执行错误" description={record.error} />}
            {record.logPersistenceError && <Alert className="scheduler-log-alert scheduler-log-detail-error" type="warning" showIcon message="日志写入错误" description={record.logPersistenceError} />}
            <div className="scheduler-log-detail-heading"><Text strong>执行参数</Text></div>
            <pre className="scheduler-log-params">{JSON.stringify(record.params || {}, null, 2)}</pre>
          </>}
        </Spin>
        <div className="scheduler-log-detail-heading"><Text strong>执行输出</Text><Text type="secondary">悬停查看输出时间（上海）与类型</Text></div>
        <form className="scheduler-log-output-filters" onSubmit={searchOutput}>
          <Select aria-label="输出类型" value={outputDraft.stream} onChange={stream => { setOutputDraft(current => ({ ...current, stream })); setOutputFilters(current => ({ ...current, stream })); }} options={[{ value: 'all', label: '全部输出' }, { value: 'stdout', label: '标准输出 stdout' }, { value: 'stderr', label: '错误输出 stderr' }]} />
          <Input aria-label="输出关键词" placeholder="搜索输出内容" allowClear maxLength={200} value={outputDraft.keyword} onChange={event => setOutputDraft(current => ({ ...current, keyword: event.target.value }))} />
          <Button htmlType="submit" icon={<SearchOutlined />}>筛选输出</Button>
        </form>
        {outputError && <Alert className="scheduler-log-alert" type="error" showIcon message={outputError} action={<Button size="small" onClick={() => loadOutput(lastOutputRequest.current)}>重试</Button>} />}
        <pre className="scheduler-log-output" aria-label="执行输出内容">{output.items.length ? output.items.map((item, index) => <span key={`${index}-${item.at}`} title={`${formatDate(item.at)} · ${item.stream}`} className={item.stream === 'stderr' ? 'scheduler-log-stderr' : ''}>{item.text}</span>) : outputLoading ? '正在读取输出…' : output.hasMore ? '本批没有匹配内容，可继续加载查找。' : '暂无匹配的输出内容。'}</pre>
        <div className="scheduler-log-output-footer">
          {output.hasMore ? <Button loading={outputLoading} onClick={() => loadOutput({ cursor: output.nextCursor || '', append: true })}>加载更多输出</Button> : <Text type="secondary">{outputLoading ? '正在读取…' : outputError ? '读取失败，可重试' : '已读取到当前输出末尾'}</Text>}
          <Text type="secondary">已显示 {output.items.length.toLocaleString()} 条输出</Text>
        </div>
      </Drawer>
    </div>
  );
}

export default SchedulerLogs;
