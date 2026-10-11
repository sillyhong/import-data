import React from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

function PageHeading({ eyebrow = '数据浏览', title, description }) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <Text className="page-eyebrow">{eyebrow}</Text>
        <Title level={2}>{title}</Title>
        {description && <Text className="page-description">{description}</Text>}
      </div>
    </div>
  );
}

export default PageHeading;
