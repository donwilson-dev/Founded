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
  const { items: income } = mergeAssumptionCollection(
    baselineAssumptions.income_sources || [],
    incomeOverrides,
    'label',
  );
  const { items: debts, overrideKeys: overriddenDebtKeys } = mergeAssumptionCollection(
    baselineAssumptions.debts || [],
    debtOverrides,
    null,
  );
  const { items: rates } = mergeAssumptionCollection(
    baselineAssumptions.interest_rates || [],
    interestRateOverrides,
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
  const scenarioByMonth = new Map(scenario.generated_rows.map((row) => [row.month, row]));
  const baselineAccountProjectionRows = generateAccountProjectionRows(
    baselineAssumptions.income_sources || [],
    baselineAssumptions.debts || [],
    baselineRows,
    baselineAssumptions.account_balances || [],
  );
  const scenarioAccountProjectionRows = scenario.account_projection_rows || [];

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
