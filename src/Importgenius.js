
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Space, Table, Select, Row, Col, Input, Button } from 'antd';
import { message } from 'antd';
import dayjs from 'dayjs';
import { updateTargetById } from './API/importgenius';
import 'antd/dist/antd.min.css'
import './Importgenius.css';


const getQueryString = (params) => {
  const queryString = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  return queryString;
}


function Importgenius() {
  const hostname = location.hostname
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [countryValue, setCountryValue] = useState('usa')
  const [isLocalhost, setIsLocalhost] = useState(hostname == 'localhost')
  const [productType, setProductType] = useState('shower door')
  const [isTarget, setIsTarget] = useState(null)
  const [keyword, setKeyword] = useState('')

  const [messageApi, contextHolder] = message.useMessage();


  const pageIndexRef = useRef(1); // 初始化pageIndex的ref
  const pageSizeRef = useRef(10); // 初始化pageSize的ref
  const totalRef = useRef(0); // 初始化pageSize的ref


  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const pageIndex = pageIndexRef.current
      const pageSize = pageSizeRef.current
      const currentCountryValue = countryValue
      const currentProductType = productType
      const prefix = isLocalhost ? '' : '/api'
      // input输入的优先级最高 > curProductType
      const curKeyWord = keyword ? keyword : currentProductType

      const queryObj = {
        country: currentCountryValue,
        keyword: curKeyWord,
        pageSize,
        pageIndex,
        isTarget,
      }
      const queryString = getQueryString(queryObj)
      // console.log('\x1b[36m%s', 'string123', `${prefix}/Importgenius?${queryString}`);
      const res = await fetch(`${prefix}/getImportgenius?${queryString}`)
      const data = await res.json()
      if (data) {
        totalRef.current = data.total
        setData(data?.data)
      }
    } catch (error) {
      console.log('error123', error);
      messageApi.open({
        type: 'error',
        content: '请求失败, 请修改参数',
      });
    } finally {
      setLoading(false)

    }
  }, [countryValue, productType, isLocalhost, keyword, isTarget])

  useEffect(() => {
    fetchData(1)
  }, [])

  const handleCountryValueChange = useCallback((value) => {
    setCountryValue(value)
  }, []);

  const handleProductTypeChange = useCallback((value) => {
    setProductType(value)
  }, [countryValue]);


  const handleUpdateTarget = useCallback(async (updateValue, id) => {
    const res = await updateTargetById(id, updateValue)
    if (res) {
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


  const renderCountrySelect = useMemo(() => {
    return (
      <Select
        defaultValue={countryValue}
        style={{ width: 120 }}
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
        defaultValue={productType}
        style={{ width: 160 }}
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

  const handleKeyWordChange = useCallback((event,) => {
    if (!event?.target?.value) return
    setKeyword(event.target.value)
  }, [])


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
    <div className="importgenius">
      {contextHolder}
      <Row style={{ marginTop: 12 }}>
        <Col span={4}> 选择国家 {
          renderCountrySelect
        }</Col>
        <Col span={4}> 选择产品类型 {
          renderProductType
        }</Col>
        <Col span={4}>
          <Space>
            <Input placeholder="关键词搜索" onBlur={handleKeyWordChange} allowClear />
          </Space>
        </Col>
        <Col span={6} style={{ display: 'flex', alignItems: 'center', flexDirection: 'center' }}>
          是否目标客户
          <Select
            style={{ width: 200 }}
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
        </Col>

        <Button
          onClick={fetchData}
          size="middle"
          type="primary"
        >
          查询
        </Button>
      </Row>
      {
        data && <Table style={{ marginTop: 12 }}
          loading={loading}
          columns={columns}
          scroll={{ x: 2800 }}
          rowkey='new_date'
          dataSource={data} pagination={
            {
              showQuickJumper: true,
              total: totalRef.current,
              onChange: (pageIndexNumber, pageSize) => {
                pageIndexRef.current = pageIndexNumber
                pageSizeRef.current = pageSize
                fetchData(pageIndexNumber, pageSize)
              },
              current: pageIndexRef.current,
              pageSize: pageSizeRef.current,
            }
          } />
      }
    </div >
  );
}

export default Importgenius;
