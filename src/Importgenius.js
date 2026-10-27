
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Space, Select, Row, Col, Input, Button, Card, Typography, DatePicker, Tooltip } from 'antd';
import { CalendarOutlined, DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import { message } from 'antd';
import dayjs from 'dayjs';
import 'moment/locale/zh-cn';
import datePickerLocale from 'antd/es/date-picker/locale/zh_CN';
import { getImportGenius, updateTargetById } from './API/importgenius';
import 'antd/dist/antd.min.css'
import './Importgenius.css';
import PageHeading from './PageHeading';
import DataPagination from './DataPagination';
import ResponsiveTable, { useMobileLayout } from './ResponsiveTable';

function Importgenius() {
  const { Text } = Typography;
  const Option = Select.Option;
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [countryValue, setCountryValue] = useState('usa')
  const [productType, setProductType] = useState('shower door')
  const [isTarget, setIsTarget] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [mostRecentRange, setMostRecentRange] = useState(null)
  const [createdRange, setCreatedRange] = useState(null)
  const [createdAtAvailable, setCreatedAtAvailable] = useState(null)
  const mobileLayout = useMobileLayout();
  const [timeFiltersOpen, setTimeFiltersOpen] = useState(false);
  const selectedTimeFilters = Number(Boolean(mostRecentRange?.[0] && mostRecentRange?.[1]))
    + Number(Boolean(createdRange?.[0] && createdRange?.[1]));

  const [messageApi, contextHolder] = message.useMessage();


  const [pageSize, setPageSize] = useState(20);
  const [pageIndex, setPageIndex] = useState(1);
  const [total, setTotal] = useState(0);
  const cursorByPageRef = useRef({ 1: null });


  const fetchData = useCallback(async (requestedPage = 1, requestedPageSize = pageSize, cursor) => {
    try {
      setLoading(true)
      const currentCountryValue = countryValue
      const currentProductType = productType
      // input输入的优先级最高 > curProductType
      const curKeyWord = keyword ? keyword : currentProductType

      const queryObj = {
        country: currentCountryValue,
        keyword: curKeyWord,
        page: requestedPage,
        pageSize: requestedPageSize,
        cursor,
        isTarget,
        mostRecentFrom: mostRecentRange?.[0]?.format('YYYY-MM-DD') || '',
        mostRecentTo: mostRecentRange?.[1]?.format('YYYY-MM-DD') || '',
        createdFrom: createdRange?.[0]?.format('YYYY-MM-DD') || '',
        createdTo: createdRange?.[1]?.format('YYYY-MM-DD') || '',
      }
      const result = await getImportGenius(queryObj)
      setData(result?.data || [])
      setTotal(Number(result?.total || 0))
      setPageIndex(Number(result?.page || requestedPage))
      setCreatedAtAvailable(result?.creationTimeAvailable !== false)
      if (result?.nextCursor) cursorByPageRef.current[requestedPage + 1] = result.nextCursor
      else delete cursorByPageRef.current[requestedPage + 1]
    } catch (error) {
      console.log('error123', error);
      messageApi.open({
        type: 'error',
        content: error.message || '请求失败，请检查数据库和关键词索引。',
      });
    } finally {
      setLoading(false)

    }
  }, [countryValue, productType, keyword, isTarget, mostRecentRange, createdRange, pageSize])

  useEffect(() => {
    fetchData(1, pageSize, null)
  }, [])

  const resetAndFetch = useCallback(() => {
    cursorByPageRef.current = { 1: null }
    setPageIndex(1)
    fetchData(1, pageSize, null)
  }, [fetchData, pageSize])

  const handleCountryValueChange = useCallback((value) => {
    setCountryValue(value)
  }, []);

  const handleProductTypeChange = useCallback((value) => {
    setProductType(value)
  }, []);


  const handleUpdateTarget = useCallback(async (updateValue, id) => {
    const res = await updateTargetById(id, updateValue)
    if (res.ok) {
      // 更新data
      const curData = data.map(item => {
        if (item.id === id) {
          item.isTarget = updateValue
        }
        return item
      })
      setData(curData)

    }
  }, [data])

  const handlePaginationChange = useCallback((page, nextPageSize) => {
    if (loading) return
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize)
      cursorByPageRef.current = { 1: null }
      setPageIndex(1)
      fetchData(1, nextPageSize, null)
      return
    }
    setPageIndex(page)
    fetchData(page, pageSize, cursorByPageRef.current[page])
  }, [fetchData, loading, pageSize])


  const renderCountrySelect = useMemo(() => {
    return (
      <Select
        size="large"
        defaultValue={countryValue}
        style={{ width: '100%' }}
        onChange={handleCountryValueChange}
        allowClear
        options={[
          /* 北美 */
          { value: 'usa', label: '美国' },
          /* 亚洲 */
          { value: 'india', label: '印度' },
          { value: 'vietnam', label: '越南' },
          /* 欧洲 */
          /* 拉丁美洲 */
          { value: 'argentina', label: '阿根廷' },
          { value: 'chile', label: '智利' },
          { value: 'colombia', label: '哥伦比亚' },
          { value: 'costarica', label: '哥斯达黎加' },
          { value: 'ecuador', label: '厄瓜多尔' },
          { value: 'panama', label: '巴拿马' },
          { value: 'peru', label: '秘鲁' },
          { value: 'paraguay', label: '巴拉圭' },
          { value: 'uruguay', label: '乌拉圭' },
          { value: 'venezuela', label: '委内瑞拉' },
        ]}
      />
    )
  }, [handleCountryValueChange, countryValue])

  const renderProductType = useMemo(() => {
    return (
      <Select
        size="large"
        defaultValue={productType}
        style={{ width: '100%' }}
        allowClear
        onChange={handleProductTypeChange}
        options={[
          { value: 'glass door handles', label: 'glass door handles' },
          { value: 'shower door', label: 'shower door' },
          { value: 'shower hinges', label: 'shower hinges' },
        ]}
      />
    )
  }, [handleProductTypeChange, productType])

  const columns = [
    {
      title: 'id',
      dataIndex: 'id',
      key: 'id',
      fixed: true,
      width: 80,
    },
    {
      title: '最新进口日期',
      dataIndex: 'mostRecentDate',
      key: 'mostRecentDate',
      width: 132,
      render: (_, { mostRecentDate }) => {
        return <span>{dayjs(mostRecentDate).format('YYYY-MM-DD')}</span>
      },
      fixed: true,
      sorter: true
    },
    {
      title: '采购商',
      dataIndex: 'company',
      key: 'company',
      // responsive: ['md', 'sm'],
      width: 300,
      fixed: true,
      render: (_, { company, url }) => (
        <a target={'_blank'} href={`https://www.importgenius.com/${url}`} rel="noreferrer">{company}</a>
      )
    },
    {
      title: '目标客户',
      key: 'action',
      dataIndex: 'action',
      responsive: ['md', 'sm'],
      fixed: true,
      width: 120,
      render: (_, { isTarget, id }) => {
        return (
          <Space size="middle">
            {/* <div className='detail-text' onClick={handelDetailClick}>Detail</div> */}
            <Select placeholder="目标客户" onChange={(value) => { handleUpdateTarget(value, id) }} value={isTarget}>
              <Option value={0}>否</Option>
              <Option value={1}>是</Option>
              <Option value={2}>未开发</Option>
            </Select>
          </Space>
        )
      },
    },
    {
      title: '供应商',
      dataIndex: 'shipper_name',
      key: 'shipper_name',
      fixed: true,
      width: 400,
      // responsive: ['md', 'sm'],
      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div style={{ wordBreak: 'break-all' }}>
            {
              shipments?.map((shipment, index) =>
                <div><a target={'_blank'} href={`https://www.importgenius.com/${shipment?.Shipper.link}`} rel="noreferrer">{`${index + 1}. ${shipment?.Shipper.name}`}</a></div>
              )
            }
          </div>
        )
      },
    },
    {
      title: '货品描述',
      key: 'product_desc',
      dataIndex: 'product_desc',
      responsive: ['md', 'sm'],
      width: 400,
      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div style={{ wordBreak: 'break-all', width: 400 }}>
            {
              shipments?.map((shipment, index) =>
                <div>{`${index + 1}. ${shipment?.ProductDescription.join(',')}`}</div>
              )
            }
          </div>
        )
      },
    },
    {
      title: '数量',
      key: 'quantity',
      width: 95,
      dataIndex: 'quantity',
      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div>
            {
              shipments.map((shipment, index) =>
                <div>{`${index + 1}. ${shipment?.Quantity ?? '-'}`}</div>
              )
            }
          </div>
        )
      },
    },
    {
      title: '数量单位',
      key: 'quantity_unit',
      dataIndex: 'quantity_unit',
      width: 80,
      // responsive: ['md', 'sm'],
      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div>
            {
              shipments.map((shipment, index) =>
                <div>{`${shipment?.QuantityUnit ?? '-'}`}</div>
              )
            }
          </div>
        )
      },

    },
    {
      title: '重量',
      key: 'weight',
      dataIndex: 'weight',
      // responsive: ['md', 'sm'],
      width: 110,
      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div>
            {
              shipments.map((shipment) =>
                <div>{`${shipment?.GrossWeightKgs}`} kg</div>
              )
            }
          </div>
        )
      },
    },
    {
      title: '原产国',
      key: 'country',
      dataIndex: 'country',
      responsive: ['md', 'sm'],
      sorter: true,

      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div>
            {
              shipments.map((shipment, index) =>
                <div>{`${shipment?.CountryOfOrigin}`}</div>
              )
            }
          </div>
        )
      },
    },
    {
      title: '提单',
      key: 'BillOfLading',
      dataIndex: 'BillOfLading',
      responsive: ['md', 'sm'],
      render: (_, { raw }) => {
        const shipments = raw?.shipments || []
        return (
          <div>
            {
              shipments.map((shipment) =>
                <div>{`${shipment?.BillOfLading}`}</div>
              )
            }
          </div>
        )
      },
    },
  ];
  return (
    <div className="data-page importgenius">
      {contextHolder}
      <PageHeading
        compact
        eyebrow="IMPORTGENIUS PROSPECTS"
        title="进口商与客户线索"
      />
      <Card className="filter-panel" bordered={false}>
        <Row className="filter-primary-row" gutter={[16, 6]} align="bottom">
          <Col xs={12} sm={6} xl={6}>
            <div className="filter-field"><Text className="filter-label">国家 / 地区</Text>{renderCountrySelect}</div>
          </Col>
          <Col xs={12} sm={6} xl={6}>
            <div className="filter-field"><Text className="filter-label">商品类别</Text>{renderProductType}</div>
          </Col>
          <Col xs={12} sm={6} xl={6}>
            <div className="filter-field">
              <Text className="filter-label">关键词</Text>
              <Input size="large" placeholder="输入关键词" value={keyword} onChange={event => setKeyword(event.target.value)} allowClear />
            </div>
          </Col>
          <Col xs={12} sm={6} xl={6}>
            <div className="filter-field">
              <Text className="filter-label">目标客户状态</Text>
              <Select
                size="large"
                style={{ width: '100%' }}
                defaultValue={isTarget}
                onChange={(value) => {
                  setIsTarget(value)
                }}
                options={[
                  { value: null, label: '全部' },
                  { value: 2, label: '未开发' },
                  { value: 1, label: '是' },
                  { value: 0, label: '否' },
                ]}
              />
            </div>
          </Col>
        </Row>
        {mobileLayout && (
          <div className="ig-mobile-filter-actions">
            <Button
              className="ig-mobile-time-toggle"
              icon={<CalendarOutlined />}
              aria-expanded={timeFiltersOpen}
              aria-controls="ig-time-filter-fields"
              aria-label={`时间筛选${selectedTimeFilters ? `，已选 ${selectedTimeFilters} 项` : ''}`}
              onClick={() => setTimeFiltersOpen(open => !open)}
            >
              时间筛选
              {selectedTimeFilters > 0 && <span className="ig-time-filter-count">{selectedTimeFilters}</span>}
              {timeFiltersOpen ? <UpOutlined /> : <DownOutlined />}
            </Button>
            <Button className="filter-submit" onClick={resetAndFetch} size="large" type="primary" icon={<SearchOutlined />}>
              查询线索
            </Button>
          </div>
        )}
        {(!mobileLayout || timeFiltersOpen) && <Row id="ig-time-filter-fields" className="importgenius-date-filters" gutter={[16, 6]} align="bottom">
          <Col xs={24} sm={12} md={9} xl={9}>
            <div className="filter-field">
              <Text className="filter-label">最新进口日期</Text>
              <DatePicker.RangePicker
                dropdownClassName="ig-date-range-popup"
                size="large"
                locale={datePickerLocale}
                format="YYYY-MM-DD"
                placeholder={['开始日期', '结束日期']}
                value={mostRecentRange}
                onChange={setMostRecentRange}
                allowClear
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={9} xl={9}>
            <div className="filter-field">
              <Text className="filter-label">数据创建时间</Text>
              <Tooltip
                title={createdAtAvailable === false ? '数据库尚未添加创建时间字段，请先运行“盘点并补齐索引”任务。' : ''}
              >
                <span className="filter-picker-wrap">
                  <DatePicker.RangePicker
                    dropdownClassName="ig-date-range-popup"
                    size="large"
                    locale={datePickerLocale}
                    format="YYYY-MM-DD"
                    placeholder={createdAtAvailable === false ? ['字段待升级', '字段待升级'] : ['开始日期', '结束日期']}
                    value={createdRange}
                    onChange={setCreatedRange}
                    disabled={createdAtAvailable === false}
                    allowClear
                  />
                </span>
              </Tooltip>
            </div>
          </Col>
          {!mobileLayout && <Col xs={24} sm={24} md={6} xl={6}>
            <div className="filter-actions">
              <Button className="filter-submit" onClick={resetAndFetch} size="large" type="primary" icon={<SearchOutlined />}>
                查询线索
              </Button>
            </div>
          </Col>}
        </Row>}
      </Card>
      {
        data && <Card className="table-panel" bordered={false}>
          <div className="table-panel-heading">
            <div><Text strong>进口商档案</Text><Text type="secondary">供应商与提单明细</Text></div>
            <span className="result-count">共 {total.toLocaleString()} 条</span>
          </div>
          <ResponsiveTable
          mobileTitleKey="company"
          mobileSummaryKeys={['mostRecentDate', 'action']}
          mobilePreviewKeys={['shipper_name', 'product_desc']}
          mobileLabel="进口商"
          loading={loading}
          columns={columns}
          scroll={{ x: 2800 }}
          rowKey="id"
          dataSource={data}
          pagination={false}
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
    </div >
  );
}

export default Importgenius;
