const {
  MAX_PROJECTION_MONTHS,
  firstOfMonth,
  formatDate,
  monthRange,
} = require('./dateRecurrenceHelpers');
const { generateAccountProjectionRows, startingCashBalance } = require('./accountProjection');
const { calculatePayoffMetrics } = require('./payoffMetrics');
const {
  debtApr,
  debtColumnLabels,
  debtIdentity,
  debtPaymentActiveForMonth,
  isBill,
  monthlyIncomeAmount,
  monthlyInterest,
  scheduledActualPayment,
  toPlainObject,
} = require('./primitives');

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function plainClone(value) {
  const plainValue = toPlainObject(value);
  if (!plainValue || typeof plainValue !== 'object') {
    return plainValue;
  }
  return { ...plainValue };
}

function jsonReady(value) {
  if (value instanceof Date) {
    return formatDate(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => jsonReady(item));
  }

  if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value') && Object.keys(value).length === 1) {
      return value.value;
    }

    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '_projection_identity') {
        continue;
      }
      result[key] = jsonReady(item);
    }
    return result;
  }

  return value;
}

function snapshotAssumptions(incomeSources, debts, interestRates, accountBalances = null) {
  return jsonReady({
    income_sources: (incomeSources || []).map(toPlainObject),
    debts: (debts || []).map(toPlainObject),
    interest_rates: (interestRates || []).map(toPlainObject),
    account_balances: (accountBalances || []).map(toPlainObject),
  });
}

function projectionLabelFor(columnLabels, debt, index) {
  const identity = debtIdentity(debt, index);
  if (Object.prototype.hasOwnProperty.call(columnLabels, identity)) {
    return columnLabels[identity];
  }
  return debt.name || 'Debt';
}

function generateBaselineProjection(
  incomeSources,
  debts,
  interestRates,
  startMonth,
  months = 60,
  endMonth = null,
  accountBalances = null,
  includeExtendedPayoff = true,
) {
  const incomeData = (incomeSources || []).map(plainClone);
  const debtData = (debts || []).map(plainClone).filter((debt) => debt.active ?? true);
  const rateData = (interestRates || []).map(plainClone);
  const accountData = accountBalances === null || accountBalances === undefined
    ? accountBalances
    : (accountBalances || []).map(plainClone);

  const columnLabels = debtColumnLabels(debtData);
  debtData.forEach((debt, index) => {
    debt._projection_identity = debtIdentity(debt, index);
    debt._projection_label = projectionLabelFor(columnLabels, debt, index);
  });

  const balances = {};
  for (const debt of debtData) {
    balances[debt._projection_identity] = Number(debt.current_balance);
  }

  let cashBalance = startingCashBalance(accountData, startMonth);
  const rows = [];

  for (const month of monthRange(startMonth, months, endMonth)) {
    const row = { month: formatDate(month) };
    const incomeTotal = (incomeData || []).reduce(
      (total, source) => total + monthlyIncomeAmount(source, month),
      0,
    );
    row.Income = roundCurrency(incomeTotal);

    const paidOff = [];
    let totalBalance = 0.0;
    let totalMinimum = 0.0;
    let totalExtra = 0.0;
    let totalInterest = 0.0;
    let totalDebtPayments = 0.0;
    let totalBills = 0.0;

    for (const debt of debtData) {
      const debtId = debt._projection_identity;
      const name = debt._projection_label || debt.name;
      const bill = isBill(debt);
      const balance = balances[debtId];

      if (month < firstOfMonth(debt.start_date) || (balance <= 0 && !bill)) {
        row[name] = roundCurrency(Math.max(balance, 0));
        row[`${name} Payment`] = 0.0;
        row[`${name} Interest`] = 0.0;
        row[`${name} Principal`] = 0.0;
        continue;
      }

      if (!debtPaymentActiveForMonth(debt, month)) {
        row[name] = roundCurrency(Math.max(balance, 0));
        row[`${name} Payment`] = 0.0;
        row[`${name} Interest`] = 0.0;
        row[`${name} Principal`] = 0.0;
        if (!bill) {
          totalBalance += balance;
        }
        continue;
      }

      const apr = debtApr(debt, rateData, month);
      const interest = monthlyInterest(balance, apr);
      const scheduledMinimum = Number(debt.minimum_monthly_payment);
      const scheduledActual = scheduledActualPayment(debt, month);
      const payment = bill ? scheduledActual : Math.min(balance + interest, scheduledActual);
      const principalPaid = Math.max(payment - interest, 0);
      const endingBalance = bill ? 0.0 : Math.max(balance + interest - payment, 0);

      row[name] = roundCurrency(endingBalance);
      row[`${name} Payment`] = bill ? 0.0 : roundCurrency(payment);
      if (bill) {
        row[`${name} Bill`] = roundCurrency(payment);
      }
      row[`${name} Interest`] = roundCurrency(interest);
      row[`${name} Principal`] = bill ? 0.0 : roundCurrency(principalPaid);

      if (!bill && balance > 0 && endingBalance === 0) {
        paidOff.push(name);
      }

      balances[debtId] = endingBalance;
      if (bill) {
        totalBills += payment;
      } else {
        totalBalance += endingBalance;
        totalInterest += interest;
        totalDebtPayments += payment;
      }

      if (payment && !bill) {
        totalMinimum += Math.min(scheduledMinimum, payment);
        totalExtra += Math.max(payment - scheduledMinimum, 0);
      }
    }

    row['Total Debt'] = roundCurrency(totalBalance);
    row['Total Minimum Payments'] = roundCurrency(totalMinimum);
    row['Total Extra Payments'] = roundCurrency(totalExtra);
    row['Total Debt Payments'] = roundCurrency(totalDebtPayments);
    row.Bills = roundCurrency(totalBills);
    row['Total Interest Charged'] = roundCurrency(totalInterest);
    row['Monthly Surplus'] = roundCurrency(incomeTotal - totalDebtPayments - totalBills);
    cashBalance += row['Monthly Surplus'];
    row['Cash Balance'] = roundCurrency(cashBalance);
    row['Debts Paid Off'] = paidOff;
    rows.push(row);
  }

  let payoffRows = rows;
  if (includeExtendedPayoff && debtData.length > 0) {
    const extended = generateBaselineProjection(
      incomeData,
      debtData,
      rateData,
      startMonth,
      MAX_PROJECTION_MONTHS,
      null,
      accountData,
      false,
    );
    payoffRows = extended.generated_rows;
  }

  const payoffMetrics = calculatePayoffMetrics(debtData, rateData, startMonth, payoffRows);
  const projectedPayoffDate = payoffMetrics.payoffMonth;
  const accountProjectionRows = generateAccountProjectionRows(incomeData, debtData, rows, accountData);
  const assumptionsSnapshot = snapshotAssumptions(incomeData, debtData, rateData, accountData);

  assumptionsSnapshot._projection_summary = {
    projected_payoff_date: projectedPayoffDate,
    months_to_debt_free: payoffMetrics.monthsToDebtFree,
    total_projected_interest: payoffMetrics.totalProjectedInterest,
    payoff_status: payoffMetrics.payoffStatus,
  };
  assumptionsSnapshot._account_projection_rows = accountProjectionRows;

  return {
    projection_type: 'baseline',
    assumptions_snapshot: assumptionsSnapshot,
    generated_rows: rows,
    account_projection_rows: accountProjectionRows,
    summary: {
      projected_payoff_date: projectedPayoffDate,
      months_to_debt_free: payoffMetrics.monthsToDebtFree,
      total_projected_interest: payoffMetrics.totalProjectedInterest,
      payoff_status: payoffMetrics.payoffStatus,
    },
  };
}

module.exports = {
  generateBaselineProjection,
  snapshotAssumptions,
  jsonReady,
};
