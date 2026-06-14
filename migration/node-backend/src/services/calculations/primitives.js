const {
  firstOfMonth,
  normalizedFrequency,
  occurrenceCountForMonth,
  parseDate,
} = require('./dateRecurrenceHelpers');

function toPlainObject(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  return value;
}

function applicableApr(debtId, rates, month) {
  const monthDate = firstOfMonth(month);
  const candidates = [];

  for (const rawRate of rates || []) {
    const rate = toPlainObject(rawRate);
    if (!rate || rate.debt_id !== debtId) {
      continue;
    }

    const start = firstOfMonth(rate.start_date);
    const end = rate.end_date;
    if (start <= monthDate && (!end || monthDate <= firstOfMonth(end))) {
      candidates.push(rate);
    }
  }

  if (candidates.length === 0) {
    return 0.0;
  }

  candidates.sort((left, right) => {
    const leftStart = firstOfMonth(left.start_date).getTime();
    const rightStart = firstOfMonth(right.start_date).getTime();
    if (leftStart !== rightStart) {
      return rightStart - leftStart;
    }
    const leftHasEnd = left.end_date !== null && left.end_date !== undefined;
    const rightHasEnd = right.end_date !== null && right.end_date !== undefined;
    return Number(rightHasEnd) - Number(leftHasEnd);
  });

  return Number(candidates[0].apr_percentage);
}

function debtApr(debt, rates, month) {
  const plainDebt = toPlainObject(debt);
  if (plainDebt.debt_type === 'other') {
    return 0.0;
  }
  return applicableApr(plainDebt.id, rates, month);
}

function isBill(debt) {
  return toPlainObject(debt).debt_type === 'other';
}

function isTrueDebt(debt) {
  return !isBill(debt);
}

function monthlyIncomeAmount(source, month) {
  const plainSource = toPlainObject(source);
  if (plainSource.is_account_transfer) {
    return 0.0;
  }

  return (
    Number(plainSource.amount) *
    occurrenceCountForMonth(
      plainSource.frequency ?? 'monthly',
      plainSource.start_date,
      plainSource.end_date,
      month,
      { active: plainSource.active ?? true },
    )
  );
}

function baseActualPayment(debt) {
  const plainDebt = toPlainObject(debt);
  const minimum = Number(plainDebt.minimum_monthly_payment);
  const actual = plainDebt.actual_monthly_payment;
  if (actual !== null && actual !== undefined) {
    return Math.max(Number(actual), minimum);
  }
  return minimum + Number(plainDebt.planned_extra_payment || 0);
}

function debtTypeLabel(value) {
  const normalized = normalizedFrequency(value, '');
  return normalized ? normalized.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : 'Debt';
}

function paymentLabel(amount) {
  const numericAmount = Number(amount || 0);
  if (Number.isInteger(numericAmount)) {
    return `$${numericAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo`;
  }
  return `$${numericAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}/mo`;
}

function debtIdentity(debt, index = null) {
  const plainDebt = toPlainObject(debt) || {};
  if (plainDebt._projection_identity !== null && plainDebt._projection_identity !== undefined) {
    return plainDebt._projection_identity;
  }
  if (plainDebt.id !== null && plainDebt.id !== undefined) {
    return plainDebt.id;
  }
  if (plainDebt.legacyId !== null && plainDebt.legacyId !== undefined) {
    return plainDebt.legacyId;
  }
  if (plainDebt._id !== null && plainDebt._id !== undefined) {
    return plainDebt._id;
  }
  return `position:${index ?? 0}`;
}

function debtIdentitySuffix(debt, index) {
  const plainDebt = toPlainObject(debt) || {};
  if (plainDebt.id !== null && plainDebt.id !== undefined) {
    return plainDebt.id;
  }
  if (plainDebt.legacyId !== null && plainDebt.legacyId !== undefined) {
    return plainDebt.legacyId;
  }
  if (plainDebt._id !== null && plainDebt._id !== undefined) {
    return plainDebt._id;
  }
  return index + 1;
}

function debtColumnLabels(debts) {
  const nameGroups = new Map();
  const debtList = debts || [];

  for (const rawDebt of debtList) {
    const debt = toPlainObject(rawDebt);
    const groupKey = String(debt.name || 'Debt').trim().toLowerCase();
    const group = nameGroups.get(groupKey) || [];
    group.push(debt);
    nameGroups.set(groupKey, group);
  }

  const labels = {};
  const used = new Set();

  debtList.forEach((rawDebt, index) => {
    const debt = toPlainObject(rawDebt);
    const identity = debtIdentity(debt, index);
    const name = String(debt.name || 'Debt').trim() || 'Debt';
    const duplicateGroup = nameGroups.get(name.toLowerCase()) || [];
    let label;

    if (debt._projection_label) {
      label = debt._projection_label;
    } else if (duplicateGroup.length === 1) {
      label = name;
    } else {
      const typeLabel = debtTypeLabel(debt.debt_type);
      const sameTypeCount = duplicateGroup.filter((item) => item.debt_type === debt.debt_type).length;
      label = `${name} (${typeLabel})`;
      if (sameTypeCount > 1) {
        label = `${name} (${typeLabel} - ${paymentLabel(baseActualPayment(debt))})`;
      }
    }

    if (used.has(label)) {
      label = `${label} #${debtIdentitySuffix(debt, index)}`;
    }

    labels[identity] = label;
    used.add(label);
  });

  return labels;
}

function scheduledActualPayment(debt, month = null) {
  const plainDebt = toPlainObject(debt);
  const payment = baseActualPayment(plainDebt);

  if (plainDebt.debt_type === 'other') {
    if (month === null || month === undefined) {
      return payment;
    }

    return (
      payment *
      occurrenceCountForMonth(
        plainDebt.recurrence || 'monthly',
        plainDebt.start_date,
        plainDebt.payoff_target_date,
        month,
        { active: plainDebt.active ?? true },
      )
    );
  }

  return payment;
}

function debtPaymentActiveForMonth(debt, month) {
  const plainDebt = toPlainObject(debt);
  if (!(plainDebt.active ?? true)) {
    return false;
  }

  const start = parseDate(plainDebt.start_date);
  const monthDate = firstOfMonth(month);
  if (monthDate < firstOfMonth(start)) {
    return false;
  }

  if (plainDebt.debt_type !== 'other') {
    return true;
  }

  return (
    occurrenceCountForMonth(
      plainDebt.recurrence || 'monthly',
      plainDebt.start_date,
      plainDebt.payoff_target_date,
      monthDate,
      { active: plainDebt.active ?? true },
    ) > 0
  );
}

function monthlyInterest(balance, aprPercentage) {
  return Math.round(Number(balance) * (Number(aprPercentage) / 100 / 12) * 100) / 100;
}

function accountLabel(account) {
  const plainAccount = toPlainObject(account);
  const name = plainAccount.name || 'Unassigned';
  const accountType = plainAccount.account_type;
  const owner = plainAccount.owner;
  const details = [accountType, owner]
    .filter((part) => part)
    .map((part) => String(part).trim())
    .join(' ');
  return details ? `${name} (${details})` : String(name);
}

module.exports = {
  toPlainObject,
  applicableApr,
  debtApr,
  isBill,
  isTrueDebt,
  monthlyIncomeAmount,
  baseActualPayment,
  debtTypeLabel,
  paymentLabel,
  debtIdentity,
  debtColumnLabels,
  scheduledActualPayment,
  debtPaymentActiveForMonth,
  monthlyInterest,
  accountLabel,
};
