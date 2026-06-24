import React from 'react';
import { Fragment, useRef } from 'react';
import { currencyPrecise, signedCurrencyPrecise, shortMonth } from '../utils/formatters.js';
import { columnLabel, filterRows, groupRowsByYear, isMoneyColumn } from '../utils/tableHelpers.js';

function formatCell(column, value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  if (column === 'month') return shortMonth(value);
  if (column === 'Monthly Surplus' || column === 'Monthly Surplus+' || column === 'Remaining Cash' || column === 'Remaining Cash+') {
    return signedCurrencyPrecise(value);
  }
  if (column === 'Net Change') return signedCurrencyPrecise(value);
  if (typeof value === 'number' && isMoneyColumn(column)) return currencyPrecise(value);
  if (typeof value === 'number') return Number(value).toLocaleString();
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatHeader(column) {
  return columnLabel(column);
}

export default function YearGroupedTable({
  rows = [],
  columns = [],
  visibleColumns = [],
  filters = {},
  emptyText = 'No rows to display.',
  onColumnReorder = null,
  onColumnHide = null,
}) {
  const tableWrapRef = useRef(null);
  const filteredRows = filterRows(rows, filters);
  const selectedColumns = visibleColumns.length ? visibleColumns : columns;
  const groups = groupRowsByYear(filteredRows);
  const reorderable = typeof onColumnReorder === 'function' && selectedColumns.length > 1;
  const hideable = typeof onColumnHide === 'function' && selectedColumns.length > 1;

  if (!filteredRows.length) {
    return <div className="empty-state">{emptyText}</div>;
  }

  return (
    <div className="table-wrap" ref={tableWrapRef}>
      <table className="projection-table">
        <thead>
          <tr>
            {selectedColumns.map((column) => (
              <th
                className={projectionHeaderClassName(column, reorderable)}
                draggable={reorderable}
                key={column}
                onDragStart={(event) => {
                  if (!reorderable) return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', column);
                  event.currentTarget.classList.add('dragging-column');
                }}
                onDragEnd={(event) => {
                  event.currentTarget.classList.remove('dragging-column');
                  if (hideable && isDropOutsideTable(event, tableWrapRef.current)) {
                    onColumnHide(column);
                  }
                }}
                onDragOver={(event) => {
                  if (!reorderable) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  if (!reorderable) return;
                  event.preventDefault();
                  const sourceColumn = event.dataTransfer.getData('text/plain');
                  onColumnReorder(sourceColumn, column);
                }}
                title={reorderable ? 'Drag to reorder column. Drop outside the table to hide column.' : undefined}
              >
                {formatHeader(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groups).map(([year, yearRows]) => (
            <Fragment key={year}>
              <tr className="year-row">
                <td colSpan={selectedColumns.length}>{year}</td>
              </tr>
              {yearRows.map((row) => (
                <tr key={row.month}>
                  {selectedColumns.map((column) => (
                    <td className={cellClassName(column, row[column])} key={`${row.month}-${column}`}>
                      {formatCell(column, row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isDropOutsideTable(event, tableElement) {
  if (!tableElement) return false;
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
  if (event.clientX === 0 && event.clientY === 0) return false;
  const rect = tableElement.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

function projectionHeaderClassName(column, reorderable) {
  const classes = [];
  if (column.endsWith('+')) classes.push('scenario-col');
  if (reorderable) classes.push('reorderable-column-header');
  return classes.join(' ');
}

function cellClassName(column, value) {
  const classes = [];
  if (column.endsWith('+')) classes.push('scenario-col');
  if (column === 'Monthly Surplus' || column === 'Monthly Surplus+' || column === 'Remaining Cash' || column === 'Remaining Cash+') {
    classes.push('monthly-surplus-cell');
    const number = Number(value || 0);
    if (number > 0) classes.push('surplus-positive');
    if (number < 0) classes.push('surplus-negative');
  }
  if (column === 'Net Change') {
    classes.push('monthly-surplus-cell');
    const number = Number(value || 0);
    if (number > 0) classes.push('surplus-positive');
    if (number < 0) classes.push('surplus-negative');
  }
  return classes.join(' ');
}
