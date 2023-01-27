import './App.css';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Space, Table, Select } from 'antd';
import { message } from 'antd';



function App() {
  const [data, setData] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [index, setIndex] = useState(0)
  const [countryValue, setCountryValue] = useState('american')
  const [productType, setProductType] = useState('glass-door-handles')


  const fetchData = useCallback(async (pageIndex, curCountryValue, curProductType) => {
    try {
      const currentCountryValue = curCountryValue || countryValue
      const currentProductType = curProductType || productType
      const res = await fetch(`/${currentCountryValue}/${currentProductType}/${pageIndex}.json`)
      // const res = await fetch(`/api/${currentCountryValue}/${currentProductType}/${pageIndex}.json`)
      const data = await res.json()
      if (data) {
        setData(data)
        const soureData = data.hits.map(item => {
          return item._source
        })
        setDataSource(soureData)
      }
    } catch (error) {
      console.log('error123', error);
      message.error(error)
    }
  }, [countryValue, productType])

  useEffect(() => {
    console.log('process', process.env &&  process.env.NODE_ENV);
    fetchData(1)
  }, [])

  const handleCountryValueChange = useCallback((value) => {
    setCountryValue(value)
      fetchData(1, value, productType)
  }, [fetchData, productType]);

  const handleProductTypeChange = useCallback((value) => {
    setProductType(value)
      fetchData(1, countryValue, value)
  }, [fetchData,countryValue]);


  const renderSelect = useMemo(() => {
    return (
      <Space wrap>
        <Select
          defaultValue={countryValue}
          style={{ width: 120 }}
          onChange={handleCountryValueChange}
          options={[
            { value: 'american', label: '美国' },
            { value: 'pakistan', label: '巴基斯坦' },
            { value: 'ecuador', label: '厄瓜多尔' },
            { value: 'india', label: '印度' },
            { value: 'ukraine', label: '乌克兰' },
          ]}
        />
      </Space>
    )
  }, [handleCountryValueChange, countryValue])

  const renderProductType = useMemo(() => {
    return (
      <Space wrap>
        <Select
          defaultValue={productType}
          style={{ width: 120 }}
          onChange={handleProductTypeChange}
          options={[
            { value: 'glass-door-handles', label: 'glass-door-handles' },
            { value: 'shower-door', label: 'shower-door' },
            { value: 'shower-hinges', label: 'shower-hinges' },
          ]}
        />
      </Space>
    )
  }, [handleProductTypeChange, productType])





  const columns = [
    {
      title: '进出口日期',
      dataIndex: 'new_date',
      key: 'new_date',
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
      dataIndex: 'importer',
      key: 'importer',
      render: (_, { importer }) => (
        <a target={'_blank'} href={`https://www.google.com.hk/search?q=${importer}`} rel="noreferrer">{importer}</a>
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
        <>
          {/* {product_desc} */}
          <div dangerouslySetInnerHTML={{ __html: product_desc }}></div>
        </>
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
      {/* <Table columns={columns} dataSource={dataSource} pagination={{ position: ['topLeft', 'bottomRight'] }}/> */}
      {
        renderSelect
      }
      {
        renderProductType
      }
      {
        data && <Table columns={columns} rowkey='new_date' dataSource={dataSource} pagination={
          {
            total: data.total,
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
