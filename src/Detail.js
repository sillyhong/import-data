import './App.css';
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, Descriptions, Empty, Typography } from 'antd';
import PageHeading from './PageHeading';

const { Text } = Typography;

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        return item.name || item.country_id || item.websiteUrl || Object.values(item).filter(Boolean).join(' · ');
      }
      return item;
    }).filter(Boolean).join('、') || '—';
  }
  if (typeof value === 'object') return Object.values(value).filter(Boolean).join(' · ') || '—';
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '—';
  return String(value);
}

function Detail() {
  const { state } = useLocation();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (state) {
      setData(state);
    }
  }, [state]);

  const fields = data ? [
    ['进出口日期', data.new_date || data.last_date || data.mostRecentDate],
    ['供应商', data.shipper_name],
    ['采购商', data.importer || data.company],
    ['海关编码', data.hs_code || data.hscode],
    ['货品描述', data.product_desc || data.info],
    ['数量', data.quantity ?? data.doc_count],
    ['数量单位', data.quantity_unit],
    ['重量', data.weight],
    ['原产国', data.country],
    ['供应商地址', data.shipper_address],
    ['采购商地址', data.consignee_address],
    ['网站', data.websiteUrl],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '') : [];

  return (
    <div className="data-page detail-page">
      <PageHeading
        eyebrow="TRADE RECORD"
        title="记录详情"
        description="查看所选贸易记录的企业、货品与来源信息。"
      />
      <Card className="detail-card" bordered={false}>
        {fields.length ? (
          <Descriptions column={{ xs: 1, sm: 1, md: 2, xl: 2 }} labelStyle={{ color: '#78879a', width: 132 }}>
            {fields.map(([label, value]) => (
              <Descriptions.Item key={label} label={label}>
                <Text className="detail-value">{displayValue(value)}</Text>
              </Descriptions.Item>
            ))}
          </Descriptions>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无可展示的详情数据"
          >
            <Link to="/app">返回进出口数据</Link>
          </Empty>
        )}
      </Card>
    </div>
  );
}

export default Detail;
