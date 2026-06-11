const { MAX_PROJECTION_MONTHS, firstOfMonth } = require('./dateRecurrenceHelpers');
const { generateBaselineProjection } = require('./baselineProjection');
const { calculatePayoffMetrics } = require('./payoffMetrics');
const {
  debtApr,
  isTrueDebt,
  toPlainObject,
} = require('./primitives');

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numeric(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  return Number(value);
}

function rowValue(row, keys, defaultValue = 0) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }
  return defaultValue;
}

function surplusValue(row, suffix = '') {
  return rowValue(row, [
    `Monthly Surplus${suffix}`,
    `Remaining Cash${suffix}`,
    'Monthly Surplus',
    'Remaining Cash',
  ]);
}

function milestoneDataset(rows) {
  const milestones = [];
  let debtFreeAdded = false;

  for (const rawRow of asArray(rows)) {
    const row = toPlainObject(rawRow);
    const month = row?.month;
    if (!month) {
      continue;
    }

    for (const name of asArray(row['Debts Paid Off'])) {
      milestones.push({ month, label: `${name} Paid Off`, type: 'paid-off' });
    }

    if (!debtFreeAdded && numeric(row['Total Debt']) <= 0) {
      debtFreeAdded = true;
      milestones.push({ month, label: 'Debt Free', type: 'debt-free' });
    }
  }

  return milestones;
}

function assumptionsCollection(assumptions, key) {
  const primary = assumptions[key];
  if (Array.isArray(primary) && primary.length > 0) {
    return primary;
  }
  if (primary && !Array.isArray(primary)) {
    return primary;
  }
  return asArray(assumptions.baseline_assumptions?.[key]);
}

function hasScenarioColumns(rows) {
  return asArray(rows).some((row) => Object.keys(toPlainObject(row) || {}).some((key) => key.endsWith('+')));
}

function debtNamesForBreakdown(debts, firstRow) {
  return asArray(debts)
    .map(toPlainObject)
    .filter((debt) => isTrueDebt(debt))
    .map((debt) => debt._projection_label || debt.name)
    .filter((name) => name && Object.prototype.hasOwnProperty.call(firstRow, name));
}

function highestBy(values, score) {
  let highest = null;
  let highestScore = -Infinity;

  for (const value of values) {
    const currentScore = score(value);
    if (highest === null || currentScore > highestScore) {
      highest = value;
      highestScore = currentScore;
    }
  }

  return highest;
}

function projectionId(savedProjection) {
  return savedProjection.id ?? savedProjection.legacyId ?? savedProjection._id ?? null;
}

function dashboardSummary(savedProjectionInput) {
  const savedProjection = toPlainObject(savedProjectionInput) || {};
  const rows = asArray(savedProjection.generated_rows).map(toPlainObject);
  if (rows.length === 0) {
    return { summary: {}, datasets: {} };
  }

  const first = rows[0];
  const scenarioKeys = hasScenarioColumns(rows);
  const useScenarioValues = String(savedProjection.projection_type) === 'scenario' && scenarioKeys;
  const suffix = useScenarioValues ? '+' : '';
  let summaryRows = useScenarioValues
    ? rows.filter((row) => Object.prototype.hasOwnProperty.call(row, `Total Debt${suffix}`))
    : rows;
  if (summaryRows.length === 0) {
    summaryRows = rows;
  }

  const summaryFirst = summaryRows[0];
  const summaryLast = summaryRows[summaryRows.length - 1];
  const assumptions = savedProjection.assumptions_snapshot || {};
  const rates = assumptionsCollection(assumptions, 'interest_rates');
  const debts = assumptionsCollection(assumptions, 'debts');
  const incomeSources = assumptionsCollection(assumptions, 'income_sources');
  const accountBalances = assumptionsCollection(assumptions, 'account_balances');
  const debtNames = debtNamesForBreakdown(debts, first);

  let totalInterest = roundCurrency(
    summaryRows.reduce(
      (total, row) => total + numeric(rowValue(row, [`Total Interest Charged${suffix}`, 'Total Interest Charged'])),
      0,
    ),
  );

  const lowestCashRow = highestBy(summaryRows, (row) => -numeric(surplusValue(row, suffix)));
  const lowestCash = numeric(surplusValue(lowestCashRow, suffix));
  const averageSurplus = roundCurrency(
    summaryRows.reduce((total, row) => total + numeric(surplusValue(row, suffix)), 0) / summaryRows.length,
  );

  const startMonth = firstOfMonth(summaryFirst.month);
  let payoffRows = summaryRows.map((row) => ({
    month: row.month,
    'Monthly Surplus': surplusValue(row, suffix),
  }));

  const trueDebts = debts.map(toPlainObject).filter(isTrueDebt);
  const trueDebtIds = new Set(trueDebts.map((debt) => debt.id));
  const trueRates = rates.map(toPlainObject).filter((rate) => trueDebtIds.has(rate.debt_id));

  if (trueDebts.length > 0) {
    const extended = generateBaselineProjection(
      incomeSources,
      trueDebts,
      trueRates,
      startMonth,
      MAX_PROJECTION_MONTHS,
      null,
      accountBalances,
      false,
    );
    payoffRows = extended.generated_rows;
  }

  const payoffMetrics = calculatePayoffMetrics(trueDebts, trueRates, startMonth, payoffRows);
  const projectedPayoffDate = payoffMetrics.payoffMonth;
  const monthsToDebtFree = payoffMetrics.monthsToDebtFree;
  totalInterest = trueDebts.length > 0 ? payoffMetrics.totalProjectedInterest : totalInterest;

  const highestBalanceDebt = highestBy(debtNames, (name) => numeric(first[name]));
  let highestAprDebt = null;
  if (trueDebts.length > 0 && trueRates.length > 0) {
    const firstMonth = firstOfMonth(first.month);
    highestAprDebt = highestBy(trueDebts, (debt) => debtApr(debt, trueRates, firstMonth))?.name ?? null;
  }

  const datasets = {
    total_debt_over_time: rows.map((row) => ({
      month: row.month,
      value: rowValue(row, [`Total Debt${suffix}`, 'Total Debt']),
    })),
    remaining_cash_flow_over_time: rows.map((row) => ({
      month: row.month,
      value: surplusValue(row, suffix),
    })),
    cash_balance_over_time: rows.map((row) => ({
      month: row.month,
      value: rowValue(row, [`Cash Balance${suffix}`, 'Cash Balance']),
    })),
    bills_over_time: rows.map((row) => ({
      month: row.month,
      value: rowValue(row, [`Bills${suffix}`, 'Bills']),
    })),
    interest_charged_over_time: rows.map((row) => ({
      month: row.month,
      value: rowValue(row, [`Total Interest Charged${suffix}`, 'Total Interest Charged']),
    })),
    principal_paid_over_time: rows.map((row) => ({
      month: row.month,
      value: roundCurrency(
        numeric(rowValue(row, [`Total Debt Payments${suffix}`, 'Total Debt Payments']))
          - numeric(rowValue(row, [`Total Interest Charged${suffix}`, 'Total Interest Charged'])),
      ),
    })),
    debt_breakdown_by_account: debtNames.map((name) => ({ name, value: first[name] })),
    milestones: milestoneDataset(payoffRows),
  };

  if (scenarioKeys) {
    datasets.scenario_total_debt_over_time = rows.map((row) => ({
      month: row.month,
      value: rowValue(row, ['Total Debt+', 'Total Debt']),
    }));
    datasets.scenario_remaining_cash_flow_over_time = rows.map((row) => ({
      month: row.month,
      value: rowValue(row, ['Monthly Surplus+', 'Remaining Cash+', 'Monthly Surplus', 'Remaining Cash']),
    }));
  }

  return {
    projection_id: projectionId(savedProjection),
    projection_type: savedProjection.projection_type,
    supports_scenario: scenarioKeys,
    projection_rows: rows,
    summary: {
      total_debt: rowValue(summaryFirst, [`Total Debt${suffix}`, 'Total Debt']),
      income_total: rowValue(summaryFirst, [`Income${suffix}`, 'Income']),
      total_debt_payments: rowValue(summaryFirst, [`Total Debt Payments${suffix}`, 'Total Debt Payments']),
      bills: rowValue(summaryFirst, [`Bills${suffix}`, 'Bills']),
      remaining_cash: surplusValue(summaryFirst, suffix),
      cash_balance: rowValue(summaryFirst, [
        `Cash Balance${suffix}`,
        'Cash Balance',
        'Monthly Surplus',
        'Remaining Cash',
      ]),
      payoff_estimate: projectedPayoffDate,
      months_to_debt_free: monthsToDebtFree,
      payoff_status: payoffMetrics.payoffStatus,
      highest_balance_debt: highestBalanceDebt,
      highest_apr_debt: highestAprDebt,
      next_projected_payoff: rows.find((row) => asArray(row['Debts Paid Off']).length > 0)?.['Debts Paid Off']?.[0] ?? null,
      total_interest_projected: totalInterest,
      lowest_projected_remaining_cash_month: lowestCashRow.month,
      lowest_projected_remaining_cash: roundCurrency(lowestCash),
      average_monthly_surplus: averageSurplus,
      ending_total_debt: rowValue(summaryLast, [`Total Debt${suffix}`, 'Total Debt']),
    },
    datasets,
  };
}

module.exports = {
  dashboardSummary,
  milestoneDataset,
};
