const {
  formatDate,
  firstOfMonth,
  inclusiveMonthCount,
  monthRange,
} = require('./dateRecurrenceHelpers');
const {
  debtApr,
  debtPaymentActiveForMonth,
  isTrueDebt,
  monthlyInterest,
  scheduledActualPayment,
  toPlainObject,
} = require('./primitives');

const MAX_PROJECTION_MONTHS = 25 * 12;

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function remainingCashByMonth(projectionRows) {
  if (!projectionRows) {
    return {};
  }

  const cashByMonth = {};
  for (const rawRow of projectionRows) {
    const row = toPlainObject(rawRow);
    if (!row.month) {
      continue;
    }
    const value = Object.prototype.hasOwnProperty.call(row, 'Monthly Surplus')
      ? row['Monthly Surplus']
      : row['Remaining Cash'] ?? 0;
    cashByMonth[row.month] = Number(value || 0);
  }
  return cashByMonth;
}

function orderedActiveDebts(debts) {
  return (debts || [])
    .map(toPlainObject)
    .filter((debt) => (debt.active ?? true) && isTrueDebt(debt))
    .sort((left, right) => {
      const leftPriorityMissing = left.priority_number === null || left.priority_number === undefined;
      const rightPriorityMissing = right.priority_number === null || right.priority_number === undefined;
      if (leftPriorityMissing !== rightPriorityMissing) {
        return Number(leftPriorityMissing) - Number(rightPriorityMissing);
      }

      const leftPriority = left.priority_number || Infinity;
      const rightPriority = right.priority_number || Infinity;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return Number(left.current_balance || 0) - Number(right.current_balance || 0);
    });
}

function calculatePayoffMetrics(
  debts,
  interestRates,
  startMonth,
  projectionRows = null,
  maxMonths = MAX_PROJECTION_MONTHS,
) {
  const ordered = orderedActiveDebts(debts);
  if (ordered.length === 0) {
    return {
      payoffMonth: null,
      monthsToDebtFree: null,
      totalProjectedInterest: 0.0,
      payoffStatus: 'no_active_debt',
    };
  }

  const rateData = (interestRates || []).map(toPlainObject);
  const balances = {};
  for (const debt of ordered) {
    balances[debt.id] = Number(debt.current_balance || 0);
  }

  const positiveBalanceTotal = Object.values(balances).reduce(
    (total, balance) => total + Math.max(balance, 0),
    0,
  );
  if (positiveBalanceTotal <= 0) {
    return {
      payoffMonth: formatDate(firstOfMonth(startMonth)),
      monthsToDebtFree: 1,
      totalProjectedInterest: 0.0,
      payoffStatus: 'paid_off',
    };
  }

  const cashByMonth = remainingCashByMonth(projectionRows);
  let lastAvailableCash = 0.0;
  let totalInterest = 0.0;
  let rollover = 0.0;
  const maxCount = Math.min(Number(maxMonths || MAX_PROJECTION_MONTHS), MAX_PROJECTION_MONTHS);

  for (const month of monthRange(startMonth, maxCount)) {
    const monthKey = formatDate(month);
    if (Object.prototype.hasOwnProperty.call(cashByMonth, monthKey)) {
      lastAvailableCash = Math.max(cashByMonth[monthKey], 0.0);
    }
    const availableExtra = Math.max(lastAvailableCash, 0.0);
    const activeDebts = ordered.filter(
      (debt) => balances[debt.id] > 0 && debtPaymentActiveForMonth(debt, month),
    );

    if (activeDebts.length === 0) {
      const remainingPositive = Object.values(balances).reduce(
        (total, balance) => total + Math.max(balance, 0),
        0,
      );
      if (remainingPositive > 0) {
        continue;
      }
      return {
        payoffMonth: monthKey,
        monthsToDebtFree: inclusiveMonthCount(startMonth, monthKey),
        totalProjectedInterest: roundCurrency(totalInterest),
        payoffStatus: 'paid_off',
      };
    }

    const targetId = activeDebts[0].id;
    const paidOffThisMonth = [];

    for (const debt of ordered) {
      const debtId = debt.id;
      if (balances[debtId] <= 0) {
        continue;
      }
      if (!debtPaymentActiveForMonth(debt, month)) {
        continue;
      }

      const apr = debtApr(debt, rateData, month);
      const interest = monthlyInterest(balances[debtId], apr);
      totalInterest += interest;
      let paymentBudget = scheduledActualPayment(debt, month);
      if (debtId === targetId) {
        paymentBudget += rollover + availableExtra;
      }
      const payment = Math.min(balances[debtId] + interest, paymentBudget);
      const endingBalance = Math.max(balances[debtId] + interest - payment, 0);
      if (endingBalance === 0) {
        paidOffThisMonth.push(debt);
      }
      balances[debtId] = endingBalance;
    }

    for (const debt of paidOffThisMonth) {
      rollover += scheduledActualPayment(debt, month);
    }

    const remainingPositive = Object.values(balances).reduce(
      (total, balance) => total + Math.max(balance, 0),
      0,
    );
    if (remainingPositive === 0) {
      return {
        payoffMonth: monthKey,
        monthsToDebtFree: inclusiveMonthCount(startMonth, monthKey),
        totalProjectedInterest: roundCurrency(totalInterest),
        payoffStatus: 'paid_off',
      };
    }
  }

  return {
    payoffMonth: null,
    monthsToDebtFree: null,
    totalProjectedInterest: roundCurrency(totalInterest),
    payoffStatus: 'not_projected',
  };
}

module.exports = {
  MAX_PROJECTION_MONTHS,
  remainingCashByMonth,
  orderedActiveDebts,
  calculatePayoffMetrics,
};
