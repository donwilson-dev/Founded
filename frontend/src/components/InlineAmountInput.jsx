import React from 'react';
import { useState } from 'react';

export function parseInlineAmount(value) {
  const text = String(value ?? '').trim();
  if (!text || !/^\d+(?:\.\d{0,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export default function InlineAmountInput({ onCommit, disabled = false, ariaLabel }) {
  const [draft, setDraft] = useState('');

  function commit() {
    if (draft.trim() === '') return;
    const parsed = parseInlineAmount(draft);
    if (parsed === null) {
      setDraft('');
      return;
    }
    onCommit(draft);
    setDraft('');
  }

  return (
    <input
      className="inline-update-input update-amount-input text-center"
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      placeholder="$0.00"
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (/^\d*(?:\.\d{0,2})?$/.test(nextValue)) setDraft(nextValue);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft('');
          event.currentTarget.blur();
        }
      }}
    />
  );
}
