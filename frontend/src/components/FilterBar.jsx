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
  ownerOptions,
  ownerValue,
  onOwnerChange,
  accountOptions,
  accountValue,
  onAccountChange,
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const columnsPickerRef = useRef(null);
  const ownerPickerRef = useRef(null);
  const accountPickerRef = useRef(null);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (columnsPickerRef.current && !columnsPickerRef.current.contains(event.target)) {
        setColumnsOpen(false);
      }
      if (ownerPickerRef.current && !ownerPickerRef.current.contains(event.target)) {
        setOwnerOpen(false);
      }
      if (accountPickerRef.current && !accountPickerRef.current.contains(event.target)) {
        setAccountOpen(false);
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

  function selectOwner(owner) {
    onOwnerChange?.(owner);
    setOwnerOpen(false);
  }

  function selectAccount(account) {
    onAccountChange?.(account);
    setAccountOpen(false);
  }

  const selectedOwnerLabel = ownerValue === 'overall' || !ownerValue ? 'Overall' : ownerValue;
  const ownerItems = ['overall', ...(ownerOptions || [])];
  const selectedAccount = (accountOptions || []).find((item) => item.value === accountValue);
  const accountItems = [{ value: 'all', label: 'All Accounts' }, ...(accountOptions || [])];

  return (
    <div className="filter-bar">
      {ownerOptions ? (
        <DropdownControl
          label="Owner"
          selectedLabel={selectedOwnerLabel}
          open={ownerOpen}
          onToggle={() => setOwnerOpen((value) => !value)}
          pickerRef={ownerPickerRef}
          menuClassName="owner-menu"
          items={ownerItems.map((owner) => ({ value: owner, label: owner === 'overall' ? 'Overall' : owner }))}
          value={ownerValue || 'overall'}
          onSelect={selectOwner}
        />
      ) : null}
      {accountOptions ? (
        <DropdownControl
          label="Account"
          selectedLabel={selectedAccount?.label || 'All Accounts'}
          open={accountOpen}
          onToggle={() => setAccountOpen((value) => !value)}
          pickerRef={accountPickerRef}
          menuClassName="account-menu"
          items={accountItems}
          value={accountValue || 'all'}
          onSelect={selectAccount}
        />
      ) : null}
      <div className="column-picker" ref={columnsPickerRef}>
        <button type="button" className="filter-columns-button" onClick={() => setColumnsOpen((value) => !value)}>
          Filter Columns <ChevronDown size={15} />
        </button>
        {columnsOpen ? (
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

export function ExportDropdown({ exportOptions = [], onExport }) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportPickerRef = useRef(null);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (exportPickerRef.current && !exportPickerRef.current.contains(event.target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  if (!exportOptions.length) return null;

  function selectExport(format) {
    onExport?.(format);
    setExportOpen(false);
  }

  return (
    <DropdownControl
      selectedLabel="Export as.."
      open={exportOpen}
      onToggle={() => setExportOpen((value) => !value)}
      pickerRef={exportPickerRef}
      menuClassName="export-menu"
      items={exportOptions}
      value=""
      onSelect={selectExport}
      unlabeled
    />
  );
}

function DropdownControl({
  label,
  selectedLabel,
  open,
  onToggle,
  pickerRef,
  menuClassName = '',
  items,
  value,
  onSelect,
  unlabeled = false,
}) {
  const control = (
    <div className="column-picker" ref={pickerRef}>
      <button
        type="button"
        className="filter-columns-button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="dropdown-button-label">{selectedLabel}</span> <ChevronDown size={15} />
      </button>
      {open ? (
        <div className={`column-menu ${menuClassName}`} role="menu">
          {items.map((item) => {
            const selected = value === item.value;
            return (
              <button
                key={item.value}
                type="button"
                className={`dropdown-menu-item ${selected ? 'is-selected' : ''}`}
                onClick={() => onSelect(item.value)}
                role="menuitemradio"
                aria-checked={selected}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
  if (unlabeled) {
    return <div className="unlabeled-filter-control">{control}</div>;
  }
  return (
    <label>
      {label}
      {control}
    </label>
  );
}
