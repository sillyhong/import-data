import './App.css';
import { useState } from 'react';
import { useEffect } from 'react';
import { useCallback } from 'react';
import React from 'react';
import {  Link } from 'react-router-dom';
import { Space, Table, Tag } from 'antd';
import { message } from 'antd';



function App() {
  const [data, setData] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [index, setIndex] = useState(0)


  const handelDetailClick = useCallback(() => {
    
  }, [])


  const fetchData = useCallback(async(pageIndex)=>{
    try {
      // const res = await fetch(`/api/American/glass-door-handles/${pageIndex}.json`)
      const res = await fetch(`/American/glass-door-handles/${pageIndex}.json`)
      const data = await res.json()
      // console.log('data', data);
      if (data) {
        setData(data)
        const soureData = data.hits.map(item => {
          return item._source
        })
        console.log('soureData', soureData);
        setDataSource(soureData)
      }
    } catch (error) {
      message.error(error)
    }
  }, [])

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

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
      render: (_, {shipper_name}) => (
        <a target={'_blank'} href={`https://www.google.com.hk/search?q=${shipper_name}`} rel="noreferrer">{shipper_name}</a>
    )
    },
    {
      title: '采购商',
      dataIndex: 'importer',
      key: 'importer',
      render: (_, {importer}) => (
          <a target={'_blank'} href={`https://www.google.com.hk/search?q=${importer}`} rel="noreferrer">{importer}</a>
      )
    },
    {
      title: '海关编码',
      key: 'hs_code',
      dataIndex: 'hs_code',
    },
    {
      title: '货品描述',
      key: 'product_desc',
      dataIndex: 'product_desc',
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
    },
    {
      title: '重量',
      key: 'weight',
      dataIndex: 'weight',
    },
    {
      title: '原产国',
      key: 'country',
      dataIndex: 'country',
    },
    {
      title: '详情',
      key: 'action',
      dataIndex: 'action',
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
        data && <Table columns={columns} dataSource={dataSource} pagination={
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
