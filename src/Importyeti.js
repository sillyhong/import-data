import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Input, Row, Select, Statistic, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import PageHeading from './PageHeading';
import {
  getImportYetiEntities,
  getImportYetiShipments,
  getImportYetiSummary,
} from './API/importyeti';
import './Importyeti.css';
import DataPagination from './DataPagination';
import ResponsiveTable from './ResponsiveTable';

const { Text } = Typography;
const DEFAULT_PAGE_SIZE = 10;

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function displayAmount(value, unit) {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  const formatted = Number.isFinite(amount) ? amount.toLocaleString() : value;
  return unit ? `${formatted} ${unit}` : formatted;
}

function profileHref(record) {
  return record.source_url || `https://www.importyeti.com/${record.entity_type}/${record.slug}`;
}

function Importyeti() {
  const [activeTab, setActiveTab] = useState('shipments');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [shipmentRows, setShipmentRows] = useState([]);
  const [shipmentPage, setShipmentPage] = useState(1);
  const [shipmentPageSize, setShipmentPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [shipmentTotal, setShipmentTotal] = useState(0);
  const shipmentCursorByPageRef = useRef({ 1: null });
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [shipmentError, setShipmentError] = useState('');
  const [shipmentKeywordDraft, setShipmentKeywordDraft] = useState('');
  const [shipmentDateDraft, setShipmentDateDraft] = useState(null);
  const [shipmentQuery, setShipmentQuery] = useState({});

  const [entityRows, setEntityRows] = useState([]);
  const [entityPage, setEntityPage] = useState(1);
  const [entityPageSize, setEntityPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [entityTotal, setEntityTotal] = useState(0);
  const entityCursorByPageRef = useRef({ 1: null });
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityError, setEntityError] = useState('');
  const [entityTypeDraft, setEntityTypeDraft] = useState('');
  const [entityKeywordDraft, setEntityKeywordDraft] = useState('');
  const [entityQuery, setEntityQuery] = useState({});

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      setSummary(await getImportYetiSummary());
    } catch (error) {
      setSummaryError(error.message || '概览数据加载失败。');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadShipments = useCallback(async (pageIndex, pageSize, filters, cursor) => {
    setShipmentLoading(true);
    setShipmentError('');
    try {
      const result = await getImportYetiShipments({ ...filters, page: pageIndex, pageSize, cursor });
      setShipmentRows(result.data || []);
      setShipmentTotal(Number(result.total || 0));
      setShipmentPage(Number(result.page || pageIndex));
      if (result.nextCursor) shipmentCursorByPageRef.current[pageIndex + 1] = result.nextCursor;
      else delete shipmentCursorByPageRef.current[pageIndex + 1];
    } catch (error) {
      setShipmentError(error.message || '提单数据加载失败。');
    } finally {
      setShipmentLoading(false);
    }
  }, []);

  const loadEntities = useCallback(async (pageIndex, pageSize, filters, cursor) => {
    setEntityLoading(true);
    setEntityError('');
    try {
      const result = await getImportYetiEntities({ ...filters, page: pageIndex, pageSize, cursor });
      setEntityRows(result.data || []);
      setEntityTotal(Number(result.total || 0));
      setEntityPage(Number(result.page || pageIndex));
      if (result.nextCursor) entityCursorByPageRef.current[pageIndex + 1] = result.nextCursor;
      else delete entityCursorByPageRef.current[pageIndex + 1];
    } catch (error) {
      setEntityError(error.message || '实体数据加载失败。');
    } finally {
      setEntityLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadShipments(1, DEFAULT_PAGE_SIZE, {}, null);
    loadEntities(1, DEFAULT_PAGE_SIZE, {}, null);
  }, [loadEntities, loadShipments, loadSummary]);

  const searchShipments = () => {
    const filters = {
      keyword: shipmentKeywordDraft.trim(),
      fromDate: shipmentDateDraft?.[0]?.format('YYYY-MM-DD') || '',
      toDate: shipmentDateDraft?.[1]?.format('YYYY-MM-DD') || '',
    };
    setShipmentQuery(filters);
    setShipmentPage(1);
    shipmentCursorByPageRef.current = { 1: null };
    loadShipments(1, shipmentPageSize, filters, null);
  };

  const resetShipmentFilters = () => {
    setShipmentKeywordDraft('');
    setShipmentDateDraft(null);
    setShipmentQuery({});
    setShipmentPage(1);
    shipmentCursorByPageRef.current = { 1: null };
    loadShipments(1, shipmentPageSize, {}, null);
  };

  const searchEntities = () => {
    const filters = { entityType: entityTypeDraft, keyword: entityKeywordDraft.trim() };
    setEntityQuery(filters);
    setEntityPage(1);
    entityCursorByPageRef.current = { 1: null };
    loadEntities(1, entityPageSize, filters, null);
  };

  const resetEntityFilters = () => {
    setEntityTypeDraft('');
    setEntityKeywordDraft('');
    setEntityQuery({});
    setEntityPage(1);
    entityCursorByPageRef.current = { 1: null };
    loadEntities(1, entityPageSize, {}, null);
  };

  const handleShipmentPaginationChange = (page, pageSize) => {
    if (shipmentLoading) return;
    if (pageSize !== shipmentPageSize) {
      setShipmentPageSize(pageSize);
      setShipmentPage(1);
      shipmentCursorByPageRef.current = { 1: null };
      loadShipments(1, pageSize, shipmentQuery, null);
      return;
    }
    setShipmentPage(page);
    loadShipments(page, shipmentPageSize, shipmentQuery, shipmentCursorByPageRef.current[page]);
  };

  const handleEntityPaginationChange = (page, pageSize) => {
    if (entityLoading) return;
    if (pageSize !== entityPageSize) {
      setEntityPageSize(pageSize);
      setEntityPage(1);
      entityCursorByPageRef.current = { 1: null };
      loadEntities(1, pageSize, entityQuery, null);
      return;
    }
    setEntityPage(page);
    loadEntities(page, entityPageSize, entityQuery, entityCursorByPageRef.current[page]);
  };

  const shipmentColumns = [
    {
      title: '到港日期',
      dataIndex: 'arrival_date',
      key: 'arrival_date',
      width: 112,
      render: displayValue,
    },
    {
      title: '提单号',
      dataIndex: 'bol_number',
      key: 'bol_number',
      width: 150,
      render: (value, record) => <span title={record.master_bol_number || ''}>{displayValue(value)}</span>,
    },
    {
      title: '采购商',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 190,
      render: (value, record) => value && record.company_slug
        ? <a href={`https://www.importyeti.com/company/${record.company_slug}`} target="_blank" rel="noreferrer">{value}</a>
        : displayValue(value),
    },
    {
      title: '供应商',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      width: 190,
      render: (value, record) => value && record.supplier_slug
        ? <a href={`https://www.importyeti.com/supplier/${record.supplier_slug}`} target="_blank" rel="noreferrer">{value}</a>
        : displayValue(value),
    },
    {
      title: '供应商国家',
      dataIndex: 'supplier_country',
      key: 'supplier_country',
      width: 125,
      render: displayValue,
    },
    {
      title: '货品描述',
      dataIndex: 'product_description',
      key: 'product_description',
      width: 280,
      render: value => <div className="iy-cell-clamp" title={value || ''}>{displayValue(value)}</div>,
    },
    {
      title: '重量',
      key: 'weight',
      width: 110,
      render: (_, record) => displayAmount(record.weight_value, record.weight_unit),
    },
    {
      title: '数量',
      key: 'quantity',
      width: 110,
      render: (_, record) => displayAmount(record.quantity_value, record.quantity_unit),
    },
    {
      title: '进 / 出口港',
      key: 'ports',
      width: 180,
      render: (_, record) => `${record.entry_port || '-'} / ${record.exit_port || '-'}`,
    },
    {
      title: 'HS 编码',
      dataIndex: 'hs_codes',
      key: 'hs_codes',
      width: 150,
      render: (value, record) => {
        const display = value || (record.hs_code_status === 'not_reported_in_public_manifest' ? '原始舱单未提供' : '-');
        return <div className="iy-cell-clamp" title={value || (display === '-' ? '' : display)}>{display}</div>;
      },
    },
    {
      title: '来源',
      dataIndex: 'source_url',
      key: 'source_url',
      width: 100,
      render: value => value
        ? <a href={value} target="_blank" rel="noreferrer">打开资料</a>
        : '-',
    },
  ];

  const entityColumns = [
    {
      title: '类型',
      dataIndex: 'entity_type',
      key: 'entity_type',
      width: 100,
      render: value => <Tag color={value === 'company' ? 'blue' : 'green'}>{value === 'company' ? '公司' : '供应商'}</Tag>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 260,
      render: (value, record) => (
        <a href={profileHref(record)} target="_blank" rel="noreferrer">
          {displayValue(value || record.slug)}
        </a>
      ),
    },
    {
      title: '国家 / 地区',
      dataIndex: 'country_code',
      key: 'country_code',
      width: 130,
      render: displayValue,
    },
    {
      title: '累计提单',
      dataIndex: 'total_shipments',
      key: 'total_shipments',
      width: 120,
      render: value => value === null ? '-' : Number(value).toLocaleString(),
    },
    {
      title: '贸易关系',
      dataIndex: 'relation_count',
      key: 'relation_count',
      width: 110,
      render: value => Number(value || 0).toLocaleString(),
    },
    {
      title: '最近采集',
      dataIndex: 'last_crawled_at',
      key: 'last_crawled_at',
      width: 170,
      render: value => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      width: 260,
      render: value => <div className="iy-cell-clamp" title={value || ''}>{displayValue(value)}</div>,
    },
  ];

  const shipmentPanel = (
    <>
      <Card className="filter-panel" bordered={false}>
        <div className="panel-caption">
          <Text strong>筛选条件</Text>
          <Text type="secondary">按提单、企业名称、货品描述或到港日期查找</Text>
        </div>
        <Row className="iy-shipment-filters" gutter={[16, 12]} align="bottom">
          <Col xs={24} md={10}>
            <div className="filter-field">
              <Text className="filter-label">关键词</Text>
              <Input
                size="middle"
                allowClear
                placeholder="提单号、公司、供应商或货品描述"
                value={shipmentKeywordDraft}
                onChange={event => setShipmentKeywordDraft(event.target.value)}
                onPressEnter={searchShipments}
              />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="filter-field">
              <Text className="filter-label">到港日期</Text>
              <DatePicker.RangePicker
                size="middle"
                className="iy-range-picker"
                dropdownClassName="iy-date-range-popup"
                value={shipmentDateDraft}
                onChange={setShipmentDateDraft}
                allowClear
              />
            </div>
          </Col>
          <Col xs={12} md={3}>
            <Button size="middle" type="primary" block onClick={searchShipments}>查询</Button>
          </Col>
          <Col xs={12} md={3}>
            <Button size="middle" block onClick={resetShipmentFilters}>重置</Button>
          </Col>
        </Row>
      </Card>
      <Card className="table-panel" bordered={false}>
        <div className="table-panel-heading">
          <div><Text strong>提单记录</Text><Text type="secondary">公开页面可见的货运明细</Text></div>
          <span className="result-count">{shipmentError || shipmentLoading ? '—' : `共 ${shipmentTotal.toLocaleString()} 条`}</span>
        </div>
        {shipmentError && (
          <Alert
            className="iy-table-alert"
            type="error"
            showIcon
            message={shipmentError}
            action={<Button size="small" onClick={() => loadShipments(shipmentPage, shipmentPageSize, shipmentQuery, shipmentCursorByPageRef.current[shipmentPage])}>重试</Button>}
          />
        )}
        <ResponsiveTable
          columns={shipmentColumns}
          mobileTitleKey="company_name"
          mobileSummaryKeys={['arrival_date', 'bol_number', 'supplier_country', 'quantity']}
          mobilePreviewKeys={['supplier_name', 'product_description']}
          mobileLabel="提单"
          dataSource={shipmentRows}
          rowKey="id"
          loading={shipmentLoading}
          scroll={{ x: 1600 }}
          locale={{ emptyText: shipmentError ? '数据加载失败' : '暂无采集记录' }}
          pagination={false}
        />
        <DataPagination
          current={shipmentPage}
          pageSize={shipmentPageSize}
          total={shipmentTotal}
          onChange={handleShipmentPaginationChange}
          disabled={shipmentLoading}
        />
      </Card>
    </>
  );

  const entityPanel = (
    <>
      <Card className="filter-panel" bordered={false}>
        <div className="panel-caption">
          <Text strong>筛选条件</Text>
          <Text type="secondary">浏览已发现的公司和供应商</Text>
        </div>
        <Row className="iy-entity-filters" gutter={[16, 12]} align="bottom">
          <Col xs={12} sm={8} md={6}>
            <div className="filter-field">
              <Text className="filter-label">实体类型</Text>
              <Select
                size="middle"
                value={entityTypeDraft}
                onChange={setEntityTypeDraft}
                options={[
                  { value: '', label: '全部类型' },
                  { value: 'company', label: '公司' },
                  { value: 'supplier', label: '供应商' },
                ]}
              />
            </div>
          </Col>
          <Col xs={12} sm={10} md={10}>
            <div className="filter-field">
              <Text className="filter-label">关键词</Text>
              <Input
                size="middle"
                allowClear
                placeholder="名称、slug、国家或地址"
                value={entityKeywordDraft}
                onChange={event => setEntityKeywordDraft(event.target.value)}
                onPressEnter={searchEntities}
              />
            </div>
          </Col>
          <Col xs={12} sm={3} md={3}>
            <Button size="middle" type="primary" block onClick={searchEntities}>查询</Button>
          </Col>
          <Col xs={12} sm={3} md={3}>
            <Button size="middle" block onClick={resetEntityFilters}>重置</Button>
          </Col>
        </Row>
      </Card>
      <Card className="table-panel" bordered={false}>
        <div className="table-panel-heading">
          <div><Text strong>公司 / 供应商</Text><Text type="secondary">已采集或发现的实体</Text></div>
          <span className="result-count">{entityError || entityLoading ? '—' : `共 ${entityTotal.toLocaleString()} 个`}</span>
        </div>
        {entityError && (
          <Alert
            className="iy-table-alert"
            type="error"
            showIcon
            message={entityError}
            action={<Button size="small" onClick={() => loadEntities(entityPage, entityPageSize, entityQuery, entityCursorByPageRef.current[entityPage])}>重试</Button>}
          />
        )}
        <ResponsiveTable
          columns={entityColumns}
          mobileTitleKey="name"
          mobileSummaryKeys={['entity_type', 'country_code', 'total_shipments', 'relation_count']}
          mobilePreviewKeys={['address', 'last_crawled_at']}
          mobileLabel="公司 / 供应商"
          dataSource={entityRows}
          rowKey="id"
          loading={entityLoading}
          scroll={{ x: 1050 }}
          locale={{ emptyText: entityError ? '数据加载失败' : '暂无采集实体' }}
          pagination={false}
        />
        <DataPagination
          current={entityPage}
          pageSize={entityPageSize}
          total={entityTotal}
          onChange={handleEntityPaginationChange}
          disabled={entityLoading}
        />
      </Card>
    </>
  );

  return (
    <div className="importyeti-page">
      <PageHeading
        compact
        eyebrow="IMPORTYETI DATA"
        title="ImportYeti 数据"
      />

      {summaryError && (
        <Alert
          className="iy-summary-alert"
          type="error"
          showIcon
          message={summaryError}
          action={<Button size="small" onClick={loadSummary}>重试</Button>}
        />
      )}

      <Row className="iy-summary-row" gutter={[14, 14]}>
        <Col xs={8} sm={8}>
          <Card className="iy-stat-card" bordered={false}>
            <Statistic title="提单记录（估算）" value={summaryLoading || summaryError ? '—' : Number(summary?.shipments || 0)} />
          </Card>
        </Col>
        <Col xs={8} sm={8}>
          <Card className="iy-stat-card" bordered={false}>
            <Statistic title="公司 / 供应商（估算）" value={summaryLoading || summaryError ? '—' : Number(summary?.entities || 0)} />
          </Card>
        </Col>
        <Col xs={8} sm={8}>
          <Card className="iy-stat-card" bordered={false}>
            <Statistic title="查询方式" value="游标分页" />
          </Card>
        </Col>
      </Row>

      <Tabs
        className="iy-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'shipments', label: '提单记录', children: shipmentPanel },
          { key: 'entities', label: '公司 / 供应商', children: entityPanel },
        ]}
      />
    </div>
  );
}

export default Importyeti;
