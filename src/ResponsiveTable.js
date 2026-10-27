import React, { useEffect, useId, useMemo, useState } from 'react';
import { Empty, Select, Spin, Table } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import './ResponsiveTable.css';

const MOBILE_QUERY = '(max-width: 767px)';

function readMobileLayout() {
  if (typeof window === 'undefined') return false;
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_QUERY).matches
    : window.innerWidth < 768;
}

export function useMobileLayout() {
  const [mobile, setMobile] = useState(readMobileLayout);
  useEffect(() => {
    const update = () => setMobile(readMobileLayout());
    update();
    if (typeof window.matchMedia !== 'function') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const query = window.matchMedia(MOBILE_QUERY);
    if (query.addEventListener) {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return mobile;
}

function flattenColumns(columns) {
  return columns.flatMap(column => column.children ? flattenColumns(column.children) : [column]);
}

function columnKey(column, index) {
  const value = column.key ?? column.dataIndex ?? index;
  return Array.isArray(value) ? value.join('.') : String(value);
}

function fieldValue(record, dataIndex) {
  if (dataIndex == null) return undefined;
  const keys = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  return keys.reduce((value, key) => value?.[key], record);
}

function renderValue(column, record, index) {
  const value = fieldValue(record, column.dataIndex);
  let rendered = typeof column.render === 'function' ? column.render(value, record, index) : value;
  // Table render callbacks may return an rc-table cell descriptor.
  if (rendered && !React.isValidElement(rendered) && typeof rendered === 'object' && 'children' in rendered) rendered = rendered.children;
  if (rendered == null || rendered === '') return '—';
  if (React.isValidElement(rendered)) return rendered;
  if (Array.isArray(rendered)) return rendered;
  if (typeof rendered === 'object') return JSON.stringify(rendered);
  return rendered;
}

function columnTitle(column) {
  return typeof column.title === 'function' ? column.title({}) : column.title;
}

function compareFor(column) {
  return typeof column?.sorter === 'function' ? column.sorter : column?.sorter?.compare;
}

function ResponsiveTable({
  mobileTitleKey,
  mobileSummaryKeys = [],
  mobilePreviewKeys = [],
  mobileLabel = '记录',
  ...tableProps
}) {
  const mobile = useMobileLayout();
  const listId = useId();
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const [mobileSort, setMobileSort] = useState(null);
  const { columns, rowKey = 'key', loading, locale, onChange, onRow } = tableProps;
  const dataSource = Array.isArray(tableProps.dataSource) ? tableProps.dataSource : [];
  const flatColumns = useMemo(() => flattenColumns(Array.isArray(columns) ? columns : []), [columns]);
  const indexedColumns = flatColumns.map((column, index) => ({ column, key: columnKey(column, index) }));
  const titleEntry = indexedColumns.find(entry => entry.key === mobileTitleKey) || indexedColumns[0];
  const summaries = indexedColumns.filter(entry => mobileSummaryKeys.includes(entry.key) && entry !== titleEntry);
  const previews = indexedColumns.filter(entry => mobilePreviewKeys.includes(entry.key) && entry !== titleEntry && !summaries.includes(entry));
  const remaining = indexedColumns.filter(entry => entry !== titleEntry && !summaries.includes(entry) && !previews.includes(entry));
  const controlledSort = indexedColumns.find(entry => entry.column.sortOrder);
  const defaultSort = indexedColumns.find(entry => entry.column.defaultSortOrder);
  const currentSort = controlledSort
    ? { key: controlledSort.key, order: controlledSort.column.sortOrder }
    : mobileSort || (defaultSort ? { key: defaultSort.key, order: defaultSort.column.defaultSortOrder } : null);
  const sorterEntries = indexedColumns.filter(entry => entry.column.sorter && (typeof onChange === 'function' || typeof compareFor(entry.column) === 'function'));

  const sortRows = sort => {
    const selected = indexedColumns.find(entry => entry.key === sort?.key);
    const compare = compareFor(selected?.column);
    if (!compare || !sort?.order) return dataSource;
    return [...dataSource].sort((left, right) => compare(left, right, sort.order) * (sort.order === 'descend' ? -1 : 1));
  };
  const rows = sortRows(currentSort);

  if (!mobile) return <Table {...tableProps} />;

  const changeSort = value => {
    const [index, order] = value === '' ? [] : value.split(':');
    const selected = sorterEntries[Number(index)];
    const nextSort = selected && order ? { key: selected.key, order } : { key: null, order: null };
    setMobileSort(nextSort);
    if (typeof onChange === 'function') {
      const filters = Object.fromEntries(indexedColumns.filter(entry => entry.column.filteredValue != null).map(entry => [entry.key, entry.column.filteredValue]));
      onChange(tableProps.pagination || {}, filters, selected && order ? {
        column: selected.column, columnKey: selected.column.key ?? selected.key,
        field: selected.column.dataIndex, order,
      } : {}, { action: 'sort', currentDataSource: sortRows(nextSort) });
    }
  };
  const selectedSortIndex = sorterEntries.findIndex(entry => entry.key === currentSort?.key);
  const spinProps = typeof loading === 'object' && loading !== null ? { spinning: true, ...loading } : { spinning: Boolean(loading) };
  const emptyText = typeof locale?.emptyText === 'function' ? locale.emptyText() : locale?.emptyText;
  const field = (entry, record, index, className = '') => (
    <div className={`responsive-record-field ${className}`.trim()} key={entry.key}>
      <dt>{columnTitle(entry.column)}</dt>
      <dd>{renderValue(entry.column, record, index)}</dd>
    </div>
  );

  return (
    <div className={`responsive-data-list ${tableProps.className || ''}`.trim()} aria-busy={spinProps.spinning}>
      {sorterEntries.length > 0 && (
        <div className="responsive-data-sort">
          <label htmlFor={`${listId}-sort`}>排序</label>
          <Select
            id={`${listId}-sort`}
            aria-label={`${mobileLabel}排序`}
            value={selectedSortIndex >= 0 && currentSort?.order ? `${selectedSortIndex}:${currentSort.order}` : ''}
            onChange={changeSort}
            options={[
              { value: '', label: '默认顺序' },
              ...sorterEntries.flatMap((entry, index) => [
                { value: `${index}:descend`, label: <>{columnTitle(entry.column)} · 降序</> },
                { value: `${index}:ascend`, label: <>{columnTitle(entry.column)} · 升序</> },
              ]),
            ]}
          />
        </div>
      )}
      <Spin {...spinProps}>
        {rows.length ? (
          <div className="responsive-records" role="list" aria-label={`${mobileLabel}列表`}>
            {rows.map((record, index) => {
              const originalKey = typeof rowKey === 'function' ? rowKey(record) : record[rowKey];
              const identity = `${String(originalKey ?? index)}:${index}`;
              const expanded = expandedRows.has(identity);
              const detailsId = `${listId}-record-${index}`;
              const rowProps = typeof onRow === 'function' ? onRow(record, index) : {};
              return (
                <article {...rowProps} role="listitem" key={identity} className={`responsive-record${expanded ? ' responsive-record--expanded' : ''}${rowProps?.className ? ` ${rowProps.className}` : ''}`}>
                  <div className="responsive-record-title" role="heading" aria-level={3}>{titleEntry ? renderValue(titleEntry.column, record, index) : `${mobileLabel} ${index + 1}`}</div>
                  {summaries.length > 0 && <dl className="responsive-record-summary">{summaries.map(entry => field(entry, record, index))}</dl>}
                  {previews.length > 0 && <dl className="responsive-record-previews">{previews.map(entry => field(entry, record, index, 'responsive-record-preview'))}</dl>}
                  {remaining.length > 0 && <dl className="responsive-record-details" id={detailsId} hidden={!expanded}>{expanded && remaining.map(entry => field(entry, record, index))}</dl>}
                  {(remaining.length > 0 || previews.length > 0) && (
                    <button
                      type="button"
                      className="responsive-record-toggle"
                      aria-expanded={expanded}
                      aria-controls={remaining.length ? detailsId : undefined}
                      onClick={() => setExpandedRows(previous => {
                        const next = new Set(previous);
                        if (next.has(identity)) next.delete(identity);
                        else next.add(identity);
                        return next;
                      })}
                    >
                      {expanded ? '收起明细' : '展开全部字段'}{expanded ? <UpOutlined /> : <DownOutlined />}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="responsive-data-empty">{React.isValidElement(emptyText) ? emptyText : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText ?? '暂无数据'} />}</div>
        )}
      </Spin>
    </div>
  );
}

export default ResponsiveTable;
