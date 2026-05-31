import React from 'react';

export default function SummaryCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  sublabel,
}) {
  return (
    <div className="summary-card">
      <div className={`summary-icon ${tone}`}>
        {Icon ? <Icon size={20} /> : null}
      </div>
      <div>
        <span>{label}</span>
        <strong className={tone}>{value}</strong>
        {sublabel ? <small>{sublabel}</small> : null}
      </div>
    </div>
  );
}
