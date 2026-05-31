import React from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { columnLabel } from '../utils/tableHelpers.js';

export default function FilterBar({
  filters,
  onChange,
  columns = [],
  visibleColumns = [],
  onColumnsChange,
  onReset,
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  function toggleColumn(column) {
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((item) => item !== column)
      : [...visibleColumns, column];
    onColumnsChange(next);
  }

  return (
    <div className="filter-bar">
      <div className="column-picker" ref={pickerRef}>
        <button type="button" className="filter-columns-button" onClick={() => setOpen((value) => !value)}>
          Filter Columns <ChevronDown size={15} />
        </button>
        {open ? (
          <div className="column-menu">
            {columns.map((column) => (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column)}
                  onChange={() => toggleColumn(column)}
                />
                {columnLabel(column)}
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <label>
        From
        <input
          type="month"
          value={filters.startMonth || ""}
          onChange={(event) =>
            onChange({ ...filters, startMonth: event.target.value })
          }
        />
      </label>
      <label>
        To
        <input
          type="month"
          value={filters.endMonth || ""}
          onChange={(event) =>
            onChange({ ...filters, endMonth: event.target.value })
          }
        />
      </label>
      <button className="ghost-button" onClick={onReset}>
        <RotateCcw size={15} /> Reset
      </button>
    </div>
  );
}
