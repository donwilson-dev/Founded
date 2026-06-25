import React from 'react';
import { useEffect, useMemo } from 'react';
import FilterBar, { ExportDropdown } from './FilterBar.jsx';
import YearGroupedTable from './YearGroupedTable.jsx';
import { useLocalState, useSessionState } from '../utils/persistence.js';
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
  hiddenColumns = [],
  onResetView,
  enableColumnReorder = false,
  resetVisibilityOnKeyChange = false,
  defaultVisibleColumns: defaultVisibleColumnsProp = null,
  className = '',
}) {
  const columns = useMemo(() => {
    const hidden = new Set(hiddenColumns);
    const discovered = getColumns(rows).filter((column) => !hidden.has(column));
    const preferred = preferredColumns.filter((column) => discovered.includes(column));
    const rest = discovered.filter((column) => !preferred.includes(column));
    return [...preferred, ...rest];
  }, [rows, preferredColumns, hiddenColumns]);
  const stateKey = storageKey || `founded.table.${title}`;
  const [filters, setFilters] = useSessionState(`${stateKey}.filters`, {});
  const [visibleColumns, setVisibleColumns] = useLocalState(`${stateKey}.visibleColumns`, []);
  const [columnOrder, setColumnOrder] = useLocalState(`${stateKey}.columnOrder`, []);
  const [appliedVisibilityResetKey, setAppliedVisibilityResetKey] = useLocalState(`${stateKey}.visibilityResetKey`, '');
  const columnSignature = columns.join('|');
  const orderedColumns = useMemo(() => normalizeColumnOrder(columnOrder, columns), [columnOrder, columnSignature]);
  const orderedColumnSignature = orderedColumns.join('|');
  const defaultVisibleColumns = useMemo(() => {
    const requestedDefaults = Array.isArray(defaultVisibleColumnsProp) && defaultVisibleColumnsProp.length
      ? defaultVisibleColumnsProp
      : preferredColumns;
    const preferred = requestedDefaults.filter((column) => orderedColumns.includes(column));
    return preferred.length ? preferred : orderedColumns.slice(0, initialVisibleCount);
  }, [orderedColumns, preferredColumns, defaultVisibleColumnsProp, initialVisibleCount]);
  const defaultVisibleSignature = defaultVisibleColumns.join('|');
  const displayVisibleColumns = useMemo(
    () => orderVisibleColumns(visibleColumns, orderedColumns),
    [visibleColumns, orderedColumnSignature]
  );

  function reorderProjectionColumn(sourceColumn, targetColumn) {
    if (!enableColumnReorder || sourceColumn === targetColumn) return;
    const sourceIndex = orderedColumns.indexOf(sourceColumn);
    const targetIndex = orderedColumns.indexOf(targetColumn);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextOrder = moveItem(orderedColumns, sourceIndex, targetIndex);
    setColumnOrder(nextOrder);
    setVisibleColumns((current = []) => orderVisibleColumns(current, nextOrder));
  }

  function hideProjectionColumn(column) {
    if (!enableColumnReorder) return;
    setVisibleColumns((current = []) => {
      const visible = orderVisibleColumns(current, orderedColumns);
      const activeColumns = visible.length ? visible : defaultVisibleColumns;
      if (activeColumns.length <= 1 || !activeColumns.includes(column)) return activeColumns;
      return activeColumns.filter((item) => item !== column);
    });
  }

  useEffect(() => {
    setVisibleColumns((current = []) => {
      const valid = Array.isArray(current) ? orderVisibleColumns(current, orderedColumns) : [];
      if (resetVisibilityOnKeyChange && visibilityResetKey && appliedVisibilityResetKey !== visibilityResetKey) {
        return defaultVisibleColumns;
      }
      return valid.length ? valid : defaultVisibleColumns;
    });
    if (resetVisibilityOnKeyChange && visibilityResetKey && appliedVisibilityResetKey !== visibilityResetKey) {
      setAppliedVisibilityResetKey(visibilityResetKey);
    }
  }, [columnSignature, orderedColumnSignature, defaultVisibleSignature, visibilityResetKey, appliedVisibilityResetKey, resetVisibilityOnKeyChange]);

  return (
    <section className={`card table-card ${className}`.trim()}>
      <div className="section-title-row projection-overview-header">
        <div className="projection-title-actions">
          <h2>{title}</h2>
          <ExportDropdown exportOptions={exportOptions} onExport={onExport} />
        </div>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          columns={orderedColumns}
          visibleColumns={displayVisibleColumns}
          onColumnsChange={setVisibleColumns}
          onReset={() => {
            setFilters({});
            setVisibleColumns(defaultVisibleColumns);
            setColumnOrder([]);
            if (resetVisibilityOnKeyChange && visibilityResetKey) {
              setAppliedVisibilityResetKey(visibilityResetKey);
            }
            onResetView?.();
          }}
          ownerOptions={ownerOptions}
          ownerValue={ownerValue}
          onOwnerChange={onOwnerChange}
          accountOptions={accountOptions}
          accountValue={accountValue}
          onAccountChange={onAccountChange}
        />
      </div>
      <YearGroupedTable
        rows={rows}
        columns={orderedColumns}
        visibleColumns={displayVisibleColumns}
        filters={filters}
        emptyText={emptyText}
        onColumnReorder={enableColumnReorder ? reorderProjectionColumn : null}
        onColumnHide={enableColumnReorder ? hideProjectionColumn : null}
      />
    </section>
  );
}

function normalizeColumnOrder(savedOrder, columns) {
  if (!Array.isArray(savedOrder) || !savedOrder.length) return columns;
  const columnSet = new Set(columns);
  const ordered = savedOrder.filter((column) => columnSet.has(column));
  const missing = columns.filter((column) => !ordered.includes(column));
  return [...ordered, ...missing];
}

function orderVisibleColumns(visibleColumns, orderedColumns) {
  if (!Array.isArray(visibleColumns) || !visibleColumns.length) return [];
  const visibleSet = new Set(visibleColumns);
  return orderedColumns.filter((column) => visibleSet.has(column));
}

function moveItem(items, fromIndex, toIndex) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
