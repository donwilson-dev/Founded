import React from 'react';
import { useEffect, useMemo } from 'react';
import FilterBar, { ExportDropdown } from './FilterBar.jsx';
import YearGroupedTable from './YearGroupedTable.jsx';
import { useSessionState } from '../utils/persistence.js';
import { getColumns } from '../utils/tableHelpers.js';

export default function ProjectionTable({
  rows = [],
  title = 'Projection Overview',
  preferredColumns = [],
  initialVisibleCount = 10,
  storageKey = '',
  ownerOptions,
  ownerValue,
  onOwnerChange,
  accountOptions,
  accountValue,
  onAccountChange,
  emptyText,
  visibilityResetKey = '',
  exportOptions,
  onExport,
}) {
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
  const defaultVisibleSignature = defaultVisibleColumns.join('|');

  useEffect(() => {
    setVisibleColumns(defaultVisibleColumns);
  }, [columnSignature, defaultVisibleSignature, visibilityResetKey]);

  return (
    <section className="card table-card">
      <div className="section-title-row projection-overview-header">
        <div className="projection-title-actions">
          <h2>{title}</h2>
          <ExportDropdown exportOptions={exportOptions} onExport={onExport} />
        </div>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          columns={columns}
          visibleColumns={visibleColumns}
          onColumnsChange={setVisibleColumns}
          onReset={() => {
            setFilters({});
            setVisibleColumns(defaultVisibleColumns);
            onOwnerChange?.('overall');
            onAccountChange?.('all');
          }}
          ownerOptions={ownerOptions}
          ownerValue={ownerValue}
          onOwnerChange={onOwnerChange}
          accountOptions={accountOptions}
          accountValue={accountValue}
          onAccountChange={onAccountChange}
        />
      </div>
      <YearGroupedTable rows={rows} columns={columns} visibleColumns={visibleColumns} filters={filters} emptyText={emptyText} />
    </section>
  );
}
