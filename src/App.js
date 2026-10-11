
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Table, Select, Card, Row, Col, Typography } from 'antd';
import { message } from 'antd';
import 'antd/dist/antd.min.css'
import './App.css';
import PageHeading from './PageHeading';

const plainText = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();


function App() {
  const { Text } = Typography;
  const hostname = window.location.hostname
  const [data, setData] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [index, setIndex] = useState(0)
  const [countryValue, setCountryValue] = useState('american')
  const [isLocalhost, setIsLocalhost] = useState(hostname == 'localhost')
  const [productType, setProductType] = useState('glass-door-handles')

  const [messageApi, contextHolder] = message.useMessage();


  const fetchData = useCallback(async (pageIndex, curCountryValue, curProductType) => {
    try {
      const currentCountryValue = curCountryValue || countryValue
      const currentProductType = curProductType || productType
      const prefix = isLocalhost ? '' : '/api'
      // const res = await fetch(`/${currentCountryValue}/${currentProductType}/${pageIndex}.json`)
      const res = await fetch(`${prefix}/${currentCountryValue}/${currentProductType}/${pageIndex}.json`)
      console.log('\x1b[36m%s', `${prefix}/${currentCountryValue}/${currentProductType}/${pageIndex}.json`);
      const data = await res.json()
      if (data) {
        setData(data)
        let soureData

        soureData = data.hits.map(item => {
          return item._source
        })

        setDataSource(soureData)
      }
    } catch (error) {
      console.log('error123', error);
      messageApi.open({
        type: 'error',
        content: '请求失败, 请修改参数',
      });
    }
  }, [countryValue, productType, isLocalhost])

  useEffect(() => {
    fetchData(1)
  }, [])

  const handleCountryValueChange = useCallback((value) => {
    setIndex(0)
    setCountryValue(value)
    fetchData(1, value, productType)
  }, [fetchData, productType]);

  const handleProductTypeChange = useCallback((value) => {
    setIndex(0)
    setProductType(value)
    fetchData(1, countryValue, value)
    console.log('\x1b[36m%s', 'index', index);
  }, [fetchData, countryValue]);


  const renderSelect = useMemo(() => {
    return (
      <Select
        size="large"
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
        size="large"
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
        eyebrow="IMPORT RECORDS"
        title="进出口数据"
        description="按国家与商品类别浏览贸易记录，快速查看供应商、采购商及货运信息。"
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
          <Table columns={columns} scroll={{ x: 1100 }} rowKey="new_date" dataSource={dataSource} pagination={
            {
              showQuickJumper: true,
              total: data.total,
              onChange: (val) => {
                fetchData(val)
                setIndex(val - 1);
              },
              current: index + 1,
              pageSize: 10,
            }
          } />
        </Card>
      }
    </div>
  );
}

export default App;
