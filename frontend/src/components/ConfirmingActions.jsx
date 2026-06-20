import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';

export default function ConfirmingActions({
  confirming = false,
  loading = false,
  activeChecked,
  onToggleActive,
  onConfirm,
  onCancel,
  onEdit,
  onRequestDelete,
  editLabel = 'Edit row',
  deleteLabel = 'Delete row',
  activeLabel = 'Active',
}) {
  const hasActiveToggle = typeof onToggleActive === 'function';
  return (
    <div className="row-actions">
      {confirming ? (
        <>
          <button type="button" className="mini-confirm-button" onClick={onConfirm} disabled={loading}>
            Confirm
          </button>
          <button type="button" className="icon-button table-action" onClick={onCancel} disabled={loading} aria-label="Cancel delete">
            x
          </button>
        </>
      ) : (
        <>
          {hasActiveToggle ? (
            <input
              className="active-quick-toggle"
              type="checkbox"
              checked={activeChecked !== false}
              disabled={loading}
              title="Active"
              aria-label={activeLabel}
              onChange={(event) => onToggleActive(event.target.checked)}
            />
          ) : null}
          <button type="button" className="icon-button table-action" onClick={onEdit} title="Edit" aria-label={editLabel}>
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            className="icon-button table-action danger-action"
            onClick={onRequestDelete}
            title="Delete"
            aria-label={deleteLabel}
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
}
