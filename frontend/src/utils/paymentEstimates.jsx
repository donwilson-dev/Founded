import React from 'react';
import { Info } from 'lucide-react';
import { currencyPrecise } from './formatters.js';

export function estimatedMinimumPayment(balanceValue, aprValue) {
  const balance = Number(balanceValue || 0);
  const apr = Number(aprValue || 0);
  if (balance <= 0) return 0;
  const monthlyInterest = balance * (apr / 100 / 12);
  return Math.min(balance, Math.max(balance * 0.02, balance * 0.01 + monthlyInterest, 40));
}

export function promoPlanningEstimates(form = {}, today = new Date()) {
  const balance = Number(form.currentBalance || 0);
  const standardApr = Number(form.aprPercentage || 0);
  const promoApr = Number(form.promoAprPercentage || 0);
  const payment = form.actualPayment === '' || form.actualPayment === undefined
    ? Number(form.minimumMonthlyPayment || 0) + Number(form.plannedExtraPayment || 0)
    : Number(form.actualPayment || 0);
  const todayIso = today.toISOString().slice(0, 10);
  const promoActive = Boolean(
    form.promoAprPercentage !== '' &&
    form.promoStartDate &&
    form.promoEndDate &&
    form.promoStartDate <= todayIso &&
    todayIso <= form.promoEndDate
  );
  const currentApr = promoActive ? promoApr : standardApr;
  const currentMinimum = estimatedMinimumPayment(balance, currentApr);

  let afterPromoMinimum = null;
  if (balance > 0 && form.promoAprPercentage !== '' && form.promoEndDate) {
    let projectedBalance = balance;
    const months = inclusiveMonthCount(todayIso, form.promoEndDate);
    for (let index = 0; index < months; index += 1) {
      const interest = projectedBalance * (promoApr / 100 / 12);
      projectedBalance = Math.max(projectedBalance + interest - payment, 0);
    }
    afterPromoMinimum = estimatedMinimumPayment(projectedBalance, standardApr);
  }

  return { currentMinimum, afterPromoMinimum };
}

export function EstimatedPaymentFields({ form }) {
  if (form?.debtType !== 'credit_card') return null;
  const { currentMinimum, afterPromoMinimum } = promoPlanningEstimates(form);
  return (
    <div className="estimate-field-stack">
      <ReadOnlyEstimate
        label="Current Est Min Payment"
        value={currencyPrecise(currentMinimum)}
        info="Current estimate based on current balance and currently active APR state."
      />
      <ReadOnlyEstimate
        label="Est Min Payment After Promo"
        value={afterPromoMinimum === null ? '-' : currencyPrecise(afterPromoMinimum)}
        info="Estimate based on projected balance remaining when promo APR expires and calculated using the standard APR."
      />
    </div>
  );
}

function ReadOnlyEstimate({ label, value, info }) {
  return (
    <label>
      <span className="label-with-info">
        {label}
        <span className="info-tip" aria-label={info}>
          <Info size={13} />
          <span className="info-popover">{info}</span>
        </span>
      </span>
      <input value={value} readOnly aria-readonly="true" />
    </label>
  );
}

function inclusiveMonthCount(startValue, endValue) {
  const start = firstOfMonth(startValue);
  const end = firstOfMonth(endValue);
  if (end < start) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function firstOfMonth(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
