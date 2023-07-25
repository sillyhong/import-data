
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Space, Table, Select } from 'antd';
import { message } from 'antd';
import 'antd/dist/antd.min.css'
import './App.css';



function App() {
  const hostname = location.hostname
  const [data, setData] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [index, setIndex] = useState(0)
  const [countryValue, setCountryValue] = useState('tradesns')
  const [isLocalhost, setIsLocalhost] = useState(hostname == 'localhost')
  const [productType, setProductType] = useState('hscode')
  
  const [messageApi, contextHolder] = message.useMessage();
 

  const fetchData = useCallback(async (pageIndex, curCountryValue, curProductType) => {
    try {
      const currentCountryValue = curCountryValue || countryValue
      const currentProductType = curProductType || productType
      const prefix = isLocalhost ? '' : '/api'
      // const res = await fetch(`/${currentCountryValue}/${currentProductType}/${pageIndex}.json`)
      const res = await fetch(`${prefix}/${currentCountryValue}/${currentProductType}/${pageIndex}.json`)
      const data = await res.json()
      console.log('====================================');
      console.log('data', data);
      console.log('====================================');
      if (data) {
        setData(data)
        const curDataSource = data?.filter(item => item.websiteUrl?.length)
        setDataSource(curDataSource)
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
    setCountryValue(value)
    fetchData(1, value, productType)
  }, [fetchData, productType]);

  const handleProductTypeChange = useCallback((value) => {
    setProductType(value)
    fetchData(1, countryValue, value)
  }, [fetchData, countryValue]);


  const renderSelect = useMemo(() => {
    return (
      <Space wrap>
        <Select
          defaultValue={countryValue}
          style={{ width: 120, marginTop: 12, marginLeft: 12 }}
          onChange={handleCountryValueChange}
          options={[
            // { value: 'american', label: '美国' },
            // { value: 'pakistan', label: '巴基斯坦' },
            // { value: 'ecuador', label: '厄瓜多尔' },
            // { value: 'india', label: '印度' },
            { value: 'tradesns', label: 'tradesns' },
          ]}
        />
      </Space>
    )
  }, [handleCountryValueChange, countryValue])

  const renderProductType = useMemo(() => {
    return (
      <Space wrap >
        <Select
          defaultValue={productType}
          style={{ width: 'auto', marginTop: 12, marginLeft: 12 }}
          onChange={handleProductTypeChange}
          options={[
            { value: 'glass-door-handles', label: 'glass-door-handles' },
            { value: 'shower-door', label: 'shower-door' },
            { value: 'shower-hinges', label: 'shower-hinges' },
            { value: 'hscode', label: 'hscode' },
          ]}
        />
      </Space>
    )
  }, [handleProductTypeChange, productType])


  const columns = [
    {
      title: '进出口日期',
      dataIndex: 'last_date',
      key: 'last_date',
    },
    {
      title: '网站',
      key: 'websiteUrl',
      dataIndex: 'websiteUrl',
      // responsive: ['md', 'sm'],
      render: (_, { websiteUrl }) => {
        return websiteUrl?.map((item, index) =>
          <div key={item.websiteUrl + index}>
            {/* <Link to={item.websiteUrl} target='_blank'>{item.websiteUrl}</Link> */}
            <a target={'_blank'} href={`https://${item.websiteUrl}`} rel="noreferrer">{item.websiteUrl}</a>
          </div>
        )
      }
    },
    {
      title: '供应商',
      dataIndex: 'shipper_name',
      key: 'shipper_name',
      render: (_, { shipper_name }) => (
        <a target={'_blank'} href={`https://www.google.com.hk/search?q=${shipper_name}`} rel="noreferrer">{shipper_name}</a>
      )
    },
    {
      title: '采购商',
      dataIndex: 'company',
      key: 'company',
      render: (_, { company }) => (
        <a target={'_blank'} href={`https://www.google.com.hk/search?q=${company}`} rel="noreferrer">{company}</a>
      )
    },
    {
      title: '海关编码',
      key: 'hscode',
      dataIndex: 'hscode',
      responsive: ['md', 'sm'],
      render: (_, { hscode }) => {
        return hscode?.map((item, index) =>
          <div key={item.name + index}>{item.name}
          </div>
        )
      }
    },
    {
      title: '货品描述',
      key: 'info',
      dataIndex: 'info',
      responsive: ['md', 'sm'],
      render: (_, { info }) => (
        <>
          {/* {product_desc} */}
          <div dangerouslySetInnerHTML={{ __html: info }}></div>
        </>
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
        return country?.map((item, index) =>
          <div key={item.country_id + index}>{item.country_id}
          </div>
        )
      }
    },
    {
      title: '详情',
      key: 'action',
      dataIndex: 'action',
      responsive: ['md', 'sm'],
      render: (_, record) => {
        return (
          <Space size="middle">
            {/* <div className='detail-text' onClick={handelDetailClick}>Detail</div> */}
            {/* <Link to={{path: '/detail', query: record }}>Detail</Link> */}
            <Link to='detail' state={record}>Detail</Link>
          </Space>
        )
      },
    },
  ];

  return (
    <div className="App">
      {contextHolder}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {
          renderSelect
        }
        {
          renderProductType
        }
      </div>
      {
        data && <Table style={{ marginTop: 12 }} columns={columns} rowkey='new_date' dataSource={dataSource} pagination={
          {
            showQuickJumper: true,
            total: dataSource.length,
            onChange: (val) => {
              fetchData(val)
              setIndex(val - 1);
            },
            current: index + 1,
            pageSize: 10
          }
        } />
      }
    </div>
  );
}

export default App;
