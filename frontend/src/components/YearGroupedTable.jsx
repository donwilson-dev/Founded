import React from 'react';
import { Fragment } from 'react';
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
}) {
  const filteredRows = filterRows(rows, filters);
  const selectedColumns = visibleColumns.length ? visibleColumns : columns;
  const groups = groupRowsByYear(filteredRows);

  if (!filteredRows.length) {
    return <div className="empty-state">{emptyText}</div>;
  }

  return (
    <div className="table-wrap">
      <table className="projection-table">
        <thead>
          <tr>
            {selectedColumns.map((column) => (
              <th className={column.endsWith('+') ? 'scenario-col' : ''} key={column}>
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
