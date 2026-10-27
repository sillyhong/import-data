import React from 'react';
import { Pagination, Select } from 'antd';
import { useMobileLayout } from './ResponsiveTable';

const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];

function DataPagination({ current, pageSize, total, onChange, disabled = false, className = '' }) {
  const mobile = useMobileLayout();
  if (mobile) return (
    <nav className={`data-pagination-mobile ${className}`.trim()} aria-label="列表分页">
      <div className="data-pagination-mobile-summary">
        <span>共 {Number(total || 0).toLocaleString()} 条 · {Math.ceil(Number(total || 0) / pageSize)} 页</span>
        <Select
          aria-label="每页条数"
          size="small"
          value={pageSize}
          disabled={disabled}
          options={PAGE_SIZE_OPTIONS.map(value => ({ value: Number(value), label: `${value} 条 / 页` }))}
          onChange={value => onChange(1, value)}
        />
      </div>
      {Number(total || 0) > 0 && <Pagination
        simple
        size="small"
        current={current}
        pageSize={pageSize}
        total={total}
        disabled={disabled}
        onChange={page => onChange(page, pageSize)}
      />}
    </nav>
  );
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
