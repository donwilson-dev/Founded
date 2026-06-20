const {
  MAX_PROJECTION_MONTHS,
  addMonths,
  firstOfMonth,
  formatDate,
} = require('./dateRecurrenceHelpers');
const { generateAccountProjectionRows } = require('./accountProjection');
const { generateBaselineProjection, jsonReady } = require('./baselineProjection');
const { debtColumnLabels, debtIdentity, toPlainObject } = require('./primitives');

function identityKey(item, naturalKey = null) {
  if (item.id !== null && item.id !== undefined) {
    return JSON.stringify(['id', item.id]);
  }
  if (naturalKey && item[naturalKey] !== null && item[naturalKey] !== undefined) {
    return JSON.stringify([naturalKey, item[naturalKey]]);
  }
  if (
    Object.prototype.hasOwnProperty.call(item, 'debt_id') &&
    Object.prototype.hasOwnProperty.call(item, 'start_date')
  ) {
    return JSON.stringify(['debt_rate', item.debt_id, formatDate(firstOfMonth(item.start_date))]);
  }
  return null;
}

function plainClone(value) {
  const plainValue = toPlainObject(value);
  if (!plainValue || typeof plainValue !== 'object') {
    return plainValue;
  }
  return { ...plainValue };
}

function mergeAssumptionCollection(baselineItems, overrideItems = null, naturalKey = null) {
  const baseline = (baselineItems || []).map(toPlainObject);
  const overrides = (overrideItems || []).map(plainClone);
  const mergedByKey = new Map();
  const orderedKeys = [];

  for (const item of baseline) {
    let key = identityKey(item, naturalKey);
    if (key === null) {
      key = JSON.stringify(['position', orderedKeys.length]);
    }
    mergedByKey.set(key, item);
    orderedKeys.push(key);
  }

  const overrideKeys = new Set();
  for (const item of overrides) {
    let key = identityKey(item, naturalKey);
    if (item.id === null || item.id === undefined) {
      if (naturalKey && item[naturalKey] !== null && item[naturalKey] !== undefined) {
        key = orderedKeys.find((existingKey) => mergedByKey.get(existingKey)?.[naturalKey] === item[naturalKey]) ?? key;
      }
    }
    if (key === null) {
      key = JSON.stringify(['override', orderedKeys.length]);
    }
    if (!mergedByKey.has(key)) {
      orderedKeys.push(key);
    }
    mergedByKey.set(key, item);
    overrideKeys.add(key);
  }

  return {
    items: orderedKeys.map((key) => mergedByKey.get(key)),
    overrideKeys,
  };
}

function monthKey(value) {
  return formatDate(firstOfMonth(value));
}

function normalizeScenarioMonth(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return monthKey(value);
}

function normalizeScenarioMonths(payload = {}) {
  return {
    scenario_start_month: normalizeScenarioMonth(payload.scenario_start_month),
    scenario_end_month: normalizeScenarioMonth(payload.scenario_end_month),
  };
}

function debtReferenceKeys(item = {}) {
  return [
    item.id,
    item._id,
    item.legacy_id,
    item.legacyId,
  ]
    .filter((id) => id !== null && id !== undefined && id !== '')
    .map(String);
}

function rateDebtReferenceKeys(rate = {}) {
  return [
    rate.debt_id,
    rate.debtId,
    rate.legacy_debt_id,
    rate.legacyDebtId,
  ]
    .filter((id) => id !== null && id !== undefined && id !== '')
    .map(String);
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function comparableMetric(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundCurrency(numeric) : String(value ?? '');
}

function debtMetricsDifferFromBaseline(scenarioRows = [], baselineRows = []) {
  const scenarioByMonth = new Map((scenarioRows || []).map((row) => [row.month, row]));
  const scenarioOwnedKeys = new Set(['month', 'Income', 'Monthly Surplus', 'Cash Balance']);

  return (baselineRows || []).some((baselineRow) => {
    const scenarioRow = scenarioByMonth.get(baselineRow.month);
    if (!scenarioRow) return false;
    const keys = new Set([...Object.keys(baselineRow), ...Object.keys(scenarioRow)]);
    for (const key of keys) {
      if (scenarioOwnedKeys.has(key) || key.endsWith('+') || key.endsWith(' Difference')) continue;
      if (comparableMetric(baselineRow[key]) !== comparableMetric(scenarioRow[key])) {
        return true;
      }
    }
    return false;
  });
}

function alignDebtMetricsToBaselineRows(scenarioRows = [], baselineRows = [], hasActiveIncomeChanges = false) {
  const baselineByMonth = new Map((baselineRows || []).map((row) => [row.month, row]));
  let cashBalance = null;
  const scenarioOwnedKeys = new Set(['month', 'Income', 'Monthly Surplus', 'Cash Balance']);

  for (const row of scenarioRows || []) {
    const baselineRow = baselineByMonth.get(row.month);
    if (!baselineRow) continue;

    const income = hasActiveIncomeChanges
      ? Number(row.Income ?? baselineRow.Income ?? 0)
      : Number(baselineRow.Income ?? row.Income ?? 0);

    for (const key of Object.keys(row)) {
      if (!scenarioOwnedKeys.has(key) && !Object.prototype.hasOwnProperty.call(baselineRow, key)) {
        delete row[key];
      }
    }

    for (const [key, value] of Object.entries(baselineRow)) {
      if (scenarioOwnedKeys.has(key)) continue;
      row[key] = Array.isArray(value) ? [...value] : value;
    }

    row.Income = roundCurrency(income);

    const monthlySurplus = roundCurrency(income - Number(row['Total Debt Payments'] || 0) - Number(row.Bills || 0));
    if (cashBalance === null) {
      cashBalance = roundCurrency(Number(baselineRow['Cash Balance'] || 0) - Number(baselineRow['Monthly Surplus'] || 0));
    }
    cashBalance = roundCurrency(cashBalance + monthlySurplus);
    row['Monthly Surplus'] = monthlySurplus;
    row['Cash Balance'] = cashBalance;
  }
}

function alignScenarioRowsToBaselineRows(scenarioRows = [], baselineRows = []) {
  const baselineByMonth = new Map((baselineRows || []).map((row) => [row.month, row]));

  for (const row of scenarioRows || []) {
    const baselineRow = baselineByMonth.get(row.month);
    if (!baselineRow) continue;

    for (const key of Object.keys(row)) {
      if (key !== 'month' && !Object.prototype.hasOwnProperty.call(baselineRow, key)) {
        delete row[key];
      }
    }

    for (const [key, value] of Object.entries(baselineRow)) {
      row[key] = Array.isArray(value) ? [...value] : value;
    }
  }
}

function baselineStartMonth(baselineRows) {
  if (!baselineRows || baselineRows.length === 0) {
    const error = new Error('Selected baseline has no generated rows');
    error.statusCode = 400;
    throw error;
  }
  return baselineRows[0].month;
}

function applyProjectionLabels(debts) {
  const columnLabels = debtColumnLabels(debts);
  debts.forEach((debt, index) => {
    const identity = debtIdentity(debt, index);
    debt._projection_identity = identity;
    debt._projection_label = Object.prototype.hasOwnProperty.call(columnLabels, identity)
      ? columnLabels[identity]
      : debt.name || 'Debt';
  });
}

function requestedMonthCount(baselineRows, start, end, months = null) {
  if (end) {
    return baselineRows.filter((row) => {
      const rowMonth = firstOfMonth(row.month);
      return start <= rowMonth && rowMonth <= end;
    }).length;
  }

  return months || baselineRows.filter((row) => firstOfMonth(row.month) >= start).length;
}

function generateScenarioProjection(
  baselineRows,
  baselineAssumptions,
  scenarioStartMonth,
  incomeOverrides = null,
  debtOverrides = null,
  interestRateOverrides = null,
  months = null,
  scenarioEndMonth = null,
) {
  const debtOverrideItems = debtOverrides || [];
  const incomeOverrideItems = incomeOverrides || [];
  const activeIncomeOverrides = incomeOverrideItems.filter((item) => item?.active !== false);
  const hasInactiveIncomeInputs = incomeOverrideItems.some((item) => item?.active === false);
  const activeDebtOverrides = debtOverrideItems.filter((item) => item?.active !== false);
  const inactiveDebtIds = new Set(
    debtOverrideItems
      .filter((item) => item?.active === false)
      .flatMap(debtReferenceKeys)
  );
  const hasInactiveDebtInputs = inactiveDebtIds.size > 0
    || (interestRateOverrides || []).some((rate) => rate?.active === false);
  const activeInterestRateOverrides = (interestRateOverrides || []).filter((rate) => {
    if (rate?.active === false) return false;
    const rateDebtIds = rateDebtReferenceKeys(rate);
    return !rateDebtIds.some((id) => inactiveDebtIds.has(id));
  });
  const hasActiveIncomeChanges = activeIncomeOverrides.length > 0;
  const hasActiveDebtChanges = activeDebtOverrides.length > 0 || activeInterestRateOverrides.length > 0;
  const hasInactiveScenarioInputs = hasInactiveIncomeInputs || hasInactiveDebtInputs;
  const { items: income } = mergeAssumptionCollection(
    baselineAssumptions.income_sources || [],
    activeIncomeOverrides,
    'label',
  );
  const { items: debts, overrideKeys: overriddenDebtKeys } = mergeAssumptionCollection(
    baselineAssumptions.debts || [],
    activeDebtOverrides,
    null,
  );
  const { items: rates } = mergeAssumptionCollection(
    baselineAssumptions.interest_rates || [],
    activeInterestRateOverrides,
  );

  let nextTemporaryDebtId = -1;
  for (const debt of debts) {
    if (debt.id === null || debt.id === undefined) {
      debt.id = nextTemporaryDebtId;
      nextTemporaryDebtId -= 1;
    }
  }

  const start = firstOfMonth(scenarioStartMonth);
  const end = scenarioEndMonth ? firstOfMonth(scenarioEndMonth) : null;
  const requestedMonths = Math.min(requestedMonthCount(baselineRows, start, end, months), MAX_PROJECTION_MONTHS);
  const priorMonth = addMonths(start, -1);
  const balanceSourceRow = (baselineRows || []).find((row) => firstOfMonth(row.month).getTime() === priorMonth.getTime());

  applyProjectionLabels(debts);

  if (balanceSourceRow) {
    for (const debt of debts) {
      const key = identityKey(debt);
      const balanceKey = debt._projection_label || debt.name;
      if (!overriddenDebtKeys.has(key) && Object.prototype.hasOwnProperty.call(balanceSourceRow, balanceKey)) {
        debt.current_balance = balanceSourceRow[balanceKey];
      }
    }
  }

  const scenario = generateBaselineProjection(
    income,
    debts,
    rates,
    start,
    requestedMonths,
    null,
    baselineAssumptions.account_balances || [],
  );
  if (!hasActiveIncomeChanges && !hasActiveDebtChanges && hasInactiveScenarioInputs) {
    alignScenarioRowsToBaselineRows(scenario.generated_rows, baselineRows);
  } else if (!hasActiveDebtChanges
    && (hasInactiveDebtInputs || hasActiveIncomeChanges)
    && debtMetricsDifferFromBaseline(scenario.generated_rows, baselineRows)) {
    alignDebtMetricsToBaselineRows(scenario.generated_rows, baselineRows, hasActiveIncomeChanges);
  }
  const scenarioByMonth = new Map(scenario.generated_rows.map((row) => [row.month, row]));
  const baselineAccountProjectionRows = generateAccountProjectionRows(
    baselineAssumptions.income_sources || [],
    baselineAssumptions.debts || [],
    baselineRows,
    baselineAssumptions.account_balances || [],
  );
  const scenarioAccountProjectionRows = generateAccountProjectionRows(
    income,
    debts,
    scenario.generated_rows,
    baselineAssumptions.account_balances || [],
  );

  const rows = [];
  for (const baselineRow of baselineRows || []) {
    const rowMonth = firstOfMonth(baselineRow.month);
    const merged = { ...baselineRow };
    if (rowMonth >= start && (end === null || rowMonth <= end) && scenarioByMonth.has(baselineRow.month)) {
      const scenarioRow = scenarioByMonth.get(baselineRow.month);
      for (const [key, value] of Object.entries(scenarioRow)) {
        if (key === 'month' || key === 'Debts Paid Off') {
          continue;
        }
        merged[`${key}+`] = value;
        if (typeof value === 'number' && typeof baselineRow[key] === 'number') {
          merged[`${key} Difference`] = Math.round((value - baselineRow[key]) * 100) / 100;
        }
      }
      merged['Debts Paid Off+'] = scenarioRow['Debts Paid Off'] || [];
    }
    rows.push(merged);
  }

  return {
    projection_type: 'scenario',
    assumptions_snapshot: jsonReady({
      _projection_summary: {
        projected_payoff_date: scenario.summary?.projected_payoff_date,
        months_to_debt_free: scenario.summary?.months_to_debt_free,
        total_projected_interest: scenario.summary?.total_projected_interest,
        payoff_status: scenario.summary?.payoff_status,
      },
      _account_projection_rows: baselineAccountProjectionRows,
      _scenario_account_projection_rows: scenarioAccountProjectionRows,
      baseline_assumptions: baselineAssumptions,
      scenario_start_month: start,
      scenario_end_month: end,
      income_sources: income,
      debts,
      interest_rates: rates,
      account_balances: baselineAssumptions.account_balances || [],
    }),
    generated_rows: rows,
    account_projection_rows: baselineAccountProjectionRows,
    scenario_account_projection_rows: scenarioAccountProjectionRows,
    summary: scenario.summary || {},
  };
}

function scenarioOverridesSnapshot(payload = {}, normalizedMonths = normalizeScenarioMonths(payload)) {
  return jsonReady({
    income_overrides: payload.income_overrides || [],
    debt_overrides: payload.debt_overrides || [],
    interest_rate_overrides: payload.interest_rate_overrides || [],
    scenario_start_month: normalizedMonths.scenario_start_month,
    scenario_end_month: normalizedMonths.scenario_end_month,
    months: payload.months ?? null,
  });
}

function buildScenarioGenerationResponse(baselineProjection, payload = {}) {
  const baselineRows = baselineProjection.generated_rows || [];
  const baselineAssumptions = baselineProjection.assumptions_snapshot || {};
  const normalizedMonths = normalizeScenarioMonths(payload);
  const generated = generateScenarioProjection(
    baselineRows,
    baselineAssumptions,
    normalizedMonths.scenario_start_month || baselineStartMonth(baselineRows),
    payload.income_overrides || [],
    payload.debt_overrides || [],
    payload.interest_rate_overrides || [],
    payload.months ?? null,
    normalizedMonths.scenario_end_month,
  );

  generated.assumptions_snapshot.baseline_projection_id = payload.baseline_projection_id;
  generated.assumptions_snapshot.scenario_overrides = scenarioOverridesSnapshot(payload, normalizedMonths);
  return generated;
}

function buildScenarioSavePayload(baselineProjection, payload = {}) {
  const generated = buildScenarioGenerationResponse(baselineProjection, payload);
  return {
    title: String(payload.title || `${baselineProjection.title} Scenario`).trim(),
    projection_type: 'scenario',
    notes: payload.notes ?? null,
    assumptions_snapshot: generated.assumptions_snapshot,
    generated_rows: generated.generated_rows,
  };
}

module.exports = {
  baselineStartMonth,
  buildScenarioGenerationResponse,
  buildScenarioSavePayload,
  generateScenarioProjection,
  identityKey,
  mergeAssumptionCollection,
  normalizeScenarioMonth,
  scenarioOverridesSnapshot,
};
