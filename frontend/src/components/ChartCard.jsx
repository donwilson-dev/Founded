import React from 'react';
import { Info } from 'lucide-react';
import EmptyState from './EmptyState.jsx';

export default function ChartCard({
  title,
  children,
  action,
  className = '',
  info,
  isEmpty = false,
  emptyTitle = 'No chart data yet',
  emptyBody = 'Select or generate projection data to populate this chart.',
}) {
  return (
    <section className={`card chart-card ${className}`}>
      <div className="card-header">
        <div className="chart-title-row">
          <h2>{title}</h2>
          {info ? (
            <span className="info-tip" aria-label={info}>
              <Info size={14} />
              <span className="info-popover">{info}</span>
            </span>
          ) : null}
        </div>
        {action}
      </div>
      <div className="chart-body">
        {isEmpty ? <EmptyState title={emptyTitle} body={emptyBody} compact /> : children}
      </div>
    </section>
  );
}
