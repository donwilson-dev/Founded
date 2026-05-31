import React from 'react';
import { useEffect, useMemo } from 'react';
import FilterBar from './FilterBar.jsx';
import YearGroupedTable from './YearGroupedTable.jsx';
import { useSessionState } from '../utils/persistence.js';
import { getColumns } from '../utils/tableHelpers.js';

export default function ProjectionTable({ rows = [], title = 'Projection Overview', preferredColumns = [], initialVisibleCount = 10, storageKey = '' }) {
  const columns = useMemo(() => {
    const discovered = getColumns(rows);
    const preferred = preferredColumns.filter((column) => discovered.includes(column));
    const rest = discovered.filter((column) => !preferred.includes(column));
    return [...preferred, ...rest];
  }, [rows, preferredColumns]);
  const stateKey = storageKey || `founded.table.${title}`;
  const [filters, setFilters] = useSessionState(`${stateKey}.filters`, {});
  const [visibleColumns, setVisibleColumns] = useSessionState(`${stateKey}.visibleColumns`, []);
  const columnSignature = columns.join('|');
  const defaultVisibleColumns = useMemo(() => {
    const preferred = preferredColumns.filter((column) => columns.includes(column));
    return preferred.length ? preferred : columns.slice(0, initialVisibleCount);
  }, [columns, preferredColumns, initialVisibleCount]);

  useEffect(() => {
    setVisibleColumns((current) => {
      const valid = current.filter((column) => columns.includes(column));
      const base = valid.length ? valid : defaultVisibleColumns;
      const requiredDefaults = ['Monthly Surplus+', 'Cash Balance', 'Cash Balance+'].filter((column) => columns.includes(column));
      return [...new Set([...base, ...requiredDefaults])];
    });
  }, [columnSignature, initialVisibleCount, defaultVisibleColumns]);

  return (
    <section className="card table-card">
      <div className="section-title-row">
        <h2>{title}</h2>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          columns={columns}
          visibleColumns={visibleColumns}
          onColumnsChange={setVisibleColumns}
          onReset={() => {
            setFilters({});
            setVisibleColumns(defaultVisibleColumns);
          }}
        />
      </div>
      <YearGroupedTable rows={rows} columns={columns} visibleColumns={visibleColumns} filters={filters} />
    </section>
  );
}
