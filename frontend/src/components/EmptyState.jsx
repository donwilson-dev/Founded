import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'Nothing to show yet', body = 'Add or select data to continue.', compact = false }) {
  return (
    <div className={`empty-state polished ${compact ? 'compact' : ''}`}>
      <Inbox size={compact ? 22 : 28} />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
