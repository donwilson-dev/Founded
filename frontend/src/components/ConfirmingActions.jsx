import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';

export default function ConfirmingActions({
  confirming = false,
  loading = false,
  onConfirm,
  onCancel,
  onEdit,
  onRequestDelete,
  editLabel = 'Edit row',
  deleteLabel = 'Delete row',
}) {
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
