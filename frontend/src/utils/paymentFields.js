export function debtActualInputValue(debt = {}) {
  const actual = debt.actual_monthly_payment;
  if (actual !== null && actual !== undefined && actual !== '') return Number(actual || 0);

  const minimum = Number(debt.minimum_monthly_payment || 0);
  const plannedExtra = Number(debt.planned_extra_payment || 0);
  return plannedExtra > 0 ? minimum + plannedExtra : 0;
}

export function debtPaymentUsedValue(debt = {}) {
  const minimum = Number(debt.minimum_monthly_payment || 0);
  const actual = debt.actual_monthly_payment;
  if (actual !== null && actual !== undefined && actual !== '') {
    const actualPayment = Number(actual || 0);
    return actualPayment > 0 ? actualPayment : minimum;
  }

  return minimum + Number(debt.planned_extra_payment || 0);
}
