
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Table, Select, Card, Row, Col, Typography } from 'antd';
import { message } from 'antd';
import 'antd/dist/antd.min.css'
import './App.css';
import PageHeading from './PageHeading';
import DataPagination from './DataPagination';

const plainText = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const SOURCE_PAGE_SIZE = 10;


function App() {
  const { Text } = Typography;
  const hostname = window.location.hostname
  const [data, setData] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [pageIndex, setPageIndex] = useState(1)
  const [pageSize, setPageSize] = useState(SOURCE_PAGE_SIZE)
  const [countryValue, setCountryValue] = useState('american')
  const isLocalhost = hostname === 'localhost'
  const [productType, setProductType] = useState('glass-door-handles')

  const [messageApi, contextHolder] = message.useMessage();


  const fetchData = useCallback(async (pageIndex, curCountryValue, curProductType, requestedPageSize = pageSize) => {
    try {
      const currentCountryValue = curCountryValue || countryValue
      const currentProductType = curProductType || productType
      const prefix = isLocalhost ? '' : '/api'
      const startIndex = (pageIndex - 1) * requestedPageSize
      const firstSourcePage = Math.floor(startIndex / SOURCE_PAGE_SIZE) + 1
      const sourceUrl = sourcePage => `${prefix}/${currentCountryValue}/${currentProductType}/${sourcePage}.json`
      const firstResponse = await fetch(sourceUrl(firstSourcePage))
      if (!firstResponse.ok) throw new Error(`数据请求失败（HTTP ${firstResponse.status}）`)
      const firstPageData = await firstResponse.json()
      const total = Number(firstPageData.total || 0)
      const lastSourcePage = Math.min(
        Math.ceil(total / SOURCE_PAGE_SIZE),
        Math.floor((startIndex + requestedPageSize - 1) / SOURCE_PAGE_SIZE) + 1
      )
      const additionalPages = Array.from(
        { length: Math.max(0, lastSourcePage - firstSourcePage) },
        (_, pageOffset) => firstSourcePage + pageOffset + 1
      )
      const additionalData = await Promise.all(additionalPages.map(async sourcePage => {
        const response = await fetch(sourceUrl(sourcePage))
        if (!response.ok) throw new Error(`第 ${sourcePage} 个数据分片请求失败（HTTP ${response.status}）`)
        return response.json()
      }))
      const rows = [firstPageData, ...additionalData].flatMap(source => (source.hits || []).map(hit => hit._source))
      const pageOffset = startIndex % SOURCE_PAGE_SIZE
      setData(firstPageData)
      setDataSource(rows.slice(pageOffset, pageOffset + requestedPageSize))
    } catch (error) {
      console.log('error123', error);
      messageApi.open({
        type: 'error',
        content: '请求失败, 请修改参数',
      });
    }
  }, [countryValue, isLocalhost, messageApi, pageSize, productType])

  useEffect(() => {
    fetchData(pageIndex, countryValue, productType, pageSize)
  }, [countryValue, fetchData, pageIndex, pageSize, productType])

  const handleCountryValueChange = useCallback((value) => {
    setPageIndex(1)
    setCountryValue(value)
  }, []);

  const handleProductTypeChange = useCallback((value) => {
    setPageIndex(1)
    setProductType(value)
  }, []);

  const handlePaginationChange = useCallback((page, nextPageSize) => {
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize)
      setPageIndex(1)
      return
    }
    setPageIndex(page)
  }, [pageSize]);


  const renderSelect = useMemo(() => {
    return (
      <Select
        size="middle"
        className="filter-select"
        value={countryValue}
        onChange={handleCountryValueChange}
        options={[
          { value: 'american', label: '美国' },
          { value: 'pakistan', label: '巴基斯坦' },
          { value: 'ecuador', label: '厄瓜多尔' },
          { value: 'india', label: '印度' },
        ]}
      />
    )
  }, [handleCountryValueChange, countryValue])

  const renderProductType = useMemo(() => {
    return (
      <Select
        size="middle"
        className="filter-select"
        value={productType}
        onChange={handleProductTypeChange}
        options={[
          { value: 'glass-door-handles', label: 'glass-door-handles' },
          { value: 'shower-door', label: 'shower-door' },
          { value: 'shower-hinges', label: 'shower-hinges' },
        ]}
      />
    )
  }, [handleProductTypeChange, productType])



  const columns = [
    {
      title: '进出口日期',
      dataIndex: 'new_date',
      key: 'new_date',
      render: (value) => <span className="trade-date">{value}</span>,
    },
    {
      title: '供应商',
      dataIndex: 'shipper_name',
      key: 'shipper_name',
      render: (_, { shipper_name }) => (
        <a className="trade-cell-clamp" title={shipper_name} target="_blank" href={`https://www.google.com.hk/search?q=${shipper_name}`} rel="noreferrer">{shipper_name}</a>
      )
    },
    {
      title: '采购商',
      dataIndex: 'importer',
      key: 'importer',
      render: (_, { importer }) => (
        <a className="trade-cell-clamp" title={importer} target="_blank" href={`https://www.google.com.hk/search?q=${importer}`} rel="noreferrer">{importer}</a>
      )
    },
    {
      title: '海关编码',
      key: 'hs_code',
      dataIndex: 'hs_code',
      responsive: ['md', 'sm'],
    },
    {
      title: '货品描述',
      key: 'product_desc',
      dataIndex: 'product_desc',
      responsive: ['md', 'sm'],
      render: (_, { product_desc }) => (
        <div className="trade-cell-clamp trade-description" title={plainText(product_desc)}>
          {plainText(product_desc)}
        </div>
      ),
    },
    {
      title: '数量',
      key: 'quantity',
      dataIndex: 'quantity',
    },
    {
      title: '数量单位',
      key: 'quantity_unit',
      dataIndex: 'quantity_unit',
      responsive: ['md', 'sm'],

    },
    {
      title: '重量',
      key: 'weight',
      dataIndex: 'weight',
      responsive: ['md', 'sm'],
    },
    {
      title: '原产国',
      key: 'country',
      dataIndex: 'country',
      responsive: ['md', 'sm'],
      render: (value) => <span className="trade-cell-clamp" title={value}>{value}</span>,
    },
    {
      title: '详情',
      key: 'detail',
      width: 112,
      fixed: 'right',
      render: (_, record) => {
        return <Link className="record-detail-link" to="detail" state={record}>查看详情</Link>
      },
    },
  ];

  return (
    <div className="data-page">
      {contextHolder}
      <PageHeading
        compact
        eyebrow="IMPORT RECORDS"
        title="进出口数据"
      />
      <Card className="filter-panel" bordered={false}>
        <div className="panel-caption">
          <Text strong>筛选条件</Text>
          <Text type="secondary">选择国家与商品类别</Text>
        </div>
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div className="filter-field">
              <Text className="filter-label">国家 / 地区</Text>
              {renderSelect}
            </div>
          </Col>
          <Col xs={24} sm={12} md={10}>
            <div className="filter-field">
              <Text className="filter-label">商品类别</Text>
              {renderProductType}
            </div>
          </Col>
        </Row>
      </Card>
      {
        data && <Card className="table-panel" bordered={false}>
          <div className="table-panel-heading">
            <div><Text strong>贸易记录</Text><Text type="secondary">供应链往来明细</Text></div>
            <span className="result-count">{data.total?.toLocaleString?.() ?? data.total} 条记录</span>
          </div>
          <Table columns={columns} scroll={{ x: 1100 }} rowKey="new_date" dataSource={dataSource} pagination={false} />
          <DataPagination
            current={pageIndex}
            pageSize={pageSize}
            total={Number(data.total || 0)}
            onChange={handlePaginationChange}
          />
        </Card>
      }
    </div>
  );
}

export default App;
