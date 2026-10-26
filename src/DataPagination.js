import React from 'react';
import { Pagination } from 'antd';

const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];

function DataPagination({ current, pageSize, total, onChange, disabled = false, className = '' }) {
  return (
    <Pagination
      className={`data-pagination ${className}`.trim()}
      current={current}
      pageSize={pageSize}
      total={total}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      showSizeChanger
      showQuickJumper
      showTotal={count => `共 ${Number(count || 0).toLocaleString()} 条 · ${Math.ceil(count / pageSize)} 页`}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export default DataPagination;
