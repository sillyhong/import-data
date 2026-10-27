
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Select, Card, Row, Col, Typography } from 'antd';
import { message } from 'antd';
import 'antd/dist/antd.min.css'
import './App.css';
import PageHeading from './PageHeading';
import DataPagination from './DataPagination';
import ResponsiveTable from './ResponsiveTable';
import { getTradesnsRecords } from './API/tradesns';

const plainText = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();


function App() {
  const { Text } = Typography;
  const [dataSource, setDataSource] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pageIndex, setPageIndex] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [countryValue, setCountryValue] = useState('tradesns')
  const [productType, setProductType] = useState('hscode')

  const [messageApi, contextHolder] = message.useMessage();


  const fetchData = useCallback(async (requestedPage, requestedPageSize, category) => {
    setLoading(true)
    try {
      const result = await getTradesnsRecords({ category, page: requestedPage, pageSize: requestedPageSize })
      setDataSource(result.data || [])
      setTotal(Number(result.total || 0))
      setPageIndex(Number(result.page || requestedPage))
    } catch (error) {
      console.log('error123', error);
      messageApi.open({
        type: 'error',
        content: '请求失败, 请修改参数',
      });
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchData(pageIndex, pageSize, productType)
  }, [fetchData, pageIndex, pageSize, productType])

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
            // { value: 'american', label: '美国' },
            // { value: 'pakistan', label: '巴基斯坦' },
            // { value: 'ecuador', label: '厄瓜多尔' },
            // { value: 'india', label: '印度' },
            { value: 'tradesns', label: 'tradesns' },
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
            { value: 'hscode', label: 'hscode' },
        ]}
      />
    )
  }, [handleProductTypeChange, productType])


  const columns = [
    {
      title: '进出口日期',
      dataIndex: 'last_date',
      key: 'last_date',
      render: (value) => <span className="trade-date">{value}</span>,
    },
    {
      title: '网站',
      key: 'websiteUrl',
      dataIndex: 'websiteUrl',
      // responsive: ['md', 'sm'],
      render: (_, { websiteUrl }) => {
        const websites = websiteUrl || [];
        return (
          <div className="trade-cell-clamp" title={websites.map((item) => item.websiteUrl).join(' · ')}>
            {websites.map((item, index) => (
              <React.Fragment key={item.websiteUrl + index}>
                {index > 0 && ' · '}
                <a target="_blank" href={`https://${item.websiteUrl}`} rel="noreferrer">{item.websiteUrl}</a>
              </React.Fragment>
            ))}
          </div>
        );
      }
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
      dataIndex: 'company',
      key: 'company',
      render: (_, { company }) => (
        <a className="trade-cell-clamp" title={company} target="_blank" href={`https://www.google.com.hk/search?q=${company}`} rel="noreferrer">{company}</a>
      )
    },
    {
      title: '海关编码',
      key: 'hscode',
      dataIndex: 'hscode',
      responsive: ['md', 'sm'],
      render: (_, { hscode }) => {
        const codes = hscode?.map((item) => item.name).join('、') || '';
        return <span className="trade-cell-clamp" title={codes}>{codes}</span>;
      }
    },
    {
      title: '货品描述',
      key: 'info',
      dataIndex: 'info',
      responsive: ['md', 'sm'],
      render: (_, { info }) => (
        <div className="trade-cell-clamp trade-description" title={plainText(info)}>
          {plainText(info)}
        </div>
      ),
    },
    {
      title: '数量',
      key: 'doc_count',
      dataIndex: 'doc_count',
    },
    // {
    //   title: '数量单位',
    //   key: 'quantity_unit',
    //   dataIndex: 'quantity_unit',
    //   responsive: ['md', 'sm'],

    // },
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
      render: (_, { country }) => {
        const countries = country?.map((item) => item.country_id).join('、') || '';
        return <span className="trade-cell-clamp" title={countries}>{countries}</span>;
      }
    },
    {
      title: '详情',
      key: 'action',
      dataIndex: 'action',
      responsive: ['md', 'sm'],
      width: 112,
      fixed: 'right',
      render: (_, record) => {
        return <Link className="record-detail-link" to="detail" state={record}>查看详情</Link>
      },
    },
  ];

  return (
    <div className="data-page tradesns-page">
      {contextHolder}
      <PageHeading
        compact
        eyebrow="TRADESNS RECORDS"
        title="TradeSNS 数据"
      />
      <Card className="filter-panel" bordered={false}>
        <div className="panel-caption">
          <Text strong>筛选条件</Text>
          <Text type="secondary">选择数据主题</Text>
        </div>
        <Row gutter={[16, 12]} align="middle">
          <Col xs={12} sm={12} md={8}>
            <div className="filter-field"><Text className="filter-label">数据源</Text>{renderSelect}</div>
          </Col>
          <Col xs={12} sm={12} md={10}>
            <div className="filter-field"><Text className="filter-label">商品类别</Text>{renderProductType}</div>
          </Col>
        </Row>
      </Card>
      {
        dataSource && <Card className="table-panel" bordered={false}>
          <div className="table-panel-heading">
            <div><Text strong>企业与商品线索</Text><Text type="secondary">TradeSNS 采集结果</Text></div>
            <span className="result-count">共 {total.toLocaleString()} 条</span>
          </div>
          <ResponsiveTable
            columns={columns}
            scroll={{ x: 1100 }}
            rowKey="last_date"
            dataSource={dataSource}
            loading={loading}
            pagination={false}
            mobileTitleKey="company"
            mobileSummaryKeys={['last_date', 'doc_count', 'country', 'action']}
            mobilePreviewKeys={['shipper_name', 'info', 'websiteUrl']}
            mobileLabel="企业线索"
          />
          <DataPagination
            current={pageIndex}
            pageSize={pageSize}
            total={total}
            onChange={handlePaginationChange}
            disabled={loading}
          />
        </Card>
      }
    </div>
  );
}

export default App;
