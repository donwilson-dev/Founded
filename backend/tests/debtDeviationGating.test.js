const assert = require('node:assert/strict');
const test = require('node:test');

const { generateBaselineProjection } = require('../src/services/calculations/baselineProjection');
const { generateScenarioProjection } = require('../src/services/calculations/scenarioProjection');

function emptyBaseline(months = 3) {
  return generateBaselineProjection([], [], [], '2026-01-01', months, null, []);
}

function scenarioRowsForDebt(debt, interestRates = [], months = 3) {
  const baseline = emptyBaseline(months);
  return generateScenarioProjection(
    baseline.generated_rows,
    baseline.assumptions_snapshot,
    '2026-01-01',
    [],
    [debt],
    interestRates,
    months,
    null,
  ).generated_rows;
}

function scenarioRowsForBaseline({ baselineDebts = [], debtOverrides = [], interestRates = [], rateOverrides = [], months = 6 }) {
  const baseline = generateBaselineProjection(
    [],
    baselineDebts,
    interestRates,
    '2026-01-01',
    months,
    null,
    [],
  );
  return generateScenarioProjection(
    baseline.generated_rows,
    baseline.assumptions_snapshot,
    '2026-01-01',
    [],
    debtOverrides,
    rateOverrides,
    months,
    null,
  ).generated_rows;
}

function hasColumn(row, column) {
  return Object.prototype.hasOwnProperty.call(row, column);
}

function amortizedDebt(overrides = {}) {
  return {
    id: overrides.id ?? 1001,
    name: overrides.name ?? 'Validation Card',
    debt_type: overrides.debt_type ?? 'credit_card',
    current_balance: overrides.current_balance ?? 4000,
    minimum_monthly_payment: overrides.minimum_monthly_payment ?? 0,
    actual_monthly_payment: overrides.actual_monthly_payment ?? 0,
    planned_extra_payment: overrides.planned_extra_payment ?? 0,
    priority_number: overrides.priority_number ?? 1,
    start_date: overrides.start_date ?? '2026-01-01',
    active: overrides.active ?? true,
  };
}

function otherDebt(overrides = {}) {
  return {
    id: overrides.id ?? 2001,
    name: overrides.name ?? 'Validation Bill',
    debt_type: 'other',
    current_balance: overrides.current_balance ?? 0,
    minimum_monthly_payment: overrides.minimum_monthly_payment ?? 100,
    actual_monthly_payment: overrides.actual_monthly_payment ?? 100,
    recurrence: overrides.recurrence ?? 'monthly',
    start_date: overrides.start_date ?? '2026-01-01',
    payoff_target_date: overrides.payoff_target_date ?? null,
    active: overrides.active ?? true,
  };
}

test('zero-payment amortized debt deviation changes balance without payment or interest activity', () => {
  const [row] = scenarioRowsForDebt(
    amortizedDebt(),
    [{ id: 1, debt_id: 1001, apr_percentage: 12, start_date: '2026-01-01', end_date: null }],
  );

  assert.equal(row['Total Debt+'], 4000);
  assert.equal(hasColumn(row, 'Validation Card+'), false);
  assert.equal(hasColumn(row, 'Total Debt Payments+'), false);
  assert.equal(hasColumn(row, 'Total Interest Charged+'), false);
  assert.equal(hasColumn(row, 'Validation Card Payment+'), false);
  assert.equal(hasColumn(row, 'Validation Card Interest+'), false);
  assert.equal(hasColumn(row, 'Validation Card Principal+'), false);
});

test('zero-balance amortized debt deviation with payment is ignored', () => {
  const [row] = scenarioRowsForDebt(
    amortizedDebt({
      current_balance: 0,
      minimum_monthly_payment: 125,
      actual_monthly_payment: 500,
    }),
  );

  assert.equal(Object.prototype.hasOwnProperty.call(row, 'Total Debt+'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'Total Debt Payments+'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'Validation Card Payment+'), false);
});

test('inactive debt deviation leaves scenario projection identical to baseline', () => {
  const baselineDebt = amortizedDebt({
    id: 7001,
    name: 'Baseline Card',
    current_balance: 4000,
    minimum_monthly_payment: 100,
    actual_monthly_payment: 250,
  });
  const baseline = generateBaselineProjection(
    [],
    [baselineDebt],
    [{ id: 7101, debt_id: 7001, apr_percentage: 12, start_date: '2026-01-01', end_date: null }],
    '2026-01-01',
    3,
    null,
    [],
  );
  const rows = generateScenarioProjection(
    baseline.generated_rows,
    baseline.assumptions_snapshot,
    '2026-01-01',
    [],
    [{ ...baselineDebt, current_balance: 1000, active: false }],
    [],
    3,
    null,
  ).generated_rows;

  assert.deepEqual(rows, baseline.generated_rows);
});

test('Other bill deviation does not reshape baseline amortized debt metrics', () => {
  const baselineDebt = amortizedDebt({
    id: 8001,
    name: 'Fresh Validation Travel Rewards Card',
    current_balance: 7000,
    minimum_monthly_payment: 125,
    actual_monthly_payment: 600,
  });
  const rows = scenarioRowsForBaseline({
    baselineDebts: [baselineDebt],
    interestRates: [{ id: 8101, debt_id: 8001, apr_percentage: 7.5, start_date: '2026-01-01', end_date: null }],
    debtOverrides: [otherDebt({
      id: 8002,
      name: 'Registration',
      recurrence: 'yearly',
      minimum_monthly_payment: 0,
      actual_monthly_payment: 300,
    })],
    months: 3,
  });

  for (const row of rows) {
    assert.equal(hasColumn(row, 'Total Debt Payments+'), false);
    assert.equal(hasColumn(row, 'Total Interest Charged+'), false);
    assert.equal(hasColumn(row, 'Total Principal Paid+'), false);
    assert.equal(hasColumn(row, 'Fresh Validation Travel Rewards Card+'), false);
    assert.equal(hasColumn(row, 'Fresh Validation Travel Rewards Card Payment+'), false);
    assert.equal(hasColumn(row, 'Fresh Validation Travel Rewards Card Interest+'), false);
    assert.equal(hasColumn(row, 'Fresh Validation Travel Rewards Card Principal+'), false);
  }
  assert.equal(rows[0]['Bills+'], 300);
  assert.equal(rows[0]['Monthly Surplus+'], -900);
  assert.equal(rows[0]['Cash Balance+'], -900);
});

test('APR override alone does not activate a no-payment balance-only debt', () => {
  const [row] = scenarioRowsForDebt(
    amortizedDebt({
      id: 9001,
      name: 'APR Only Card',
      current_balance: 4000,
      minimum_monthly_payment: 0,
      actual_monthly_payment: 0,
    }),
    [{ id: 9101, debt_id: 9001, apr_percentage: 18, start_date: '2026-01-01', end_date: null }],
  );

  assert.equal(row['Total Debt+'], 4000);
  assert.equal(hasColumn(row, 'Total Debt Payments+'), false);
  assert.equal(hasColumn(row, 'Total Interest Charged+'), false);
  assert.equal(hasColumn(row, 'Total Principal Paid+'), false);
  assert.equal(hasColumn(row, 'APR Only Card Interest+'), false);
  assert.equal(hasColumn(row, 'APR Only Card Principal+'), false);
});

test('scenario comparison emits debt detail columns only for active debt overrides', () => {
  const unrelatedDebt = amortizedDebt({
    id: 3001,
    name: 'Fresh Validation Travel Rewards Card',
    current_balance: 7000,
    minimum_monthly_payment: 125,
    actual_monthly_payment: 600,
  });
  const activeDebt = amortizedDebt({
    id: 3002,
    name: 'Test 2',
    current_balance: 5000,
    minimum_monthly_payment: 100,
    actual_monthly_payment: 250,
  });
  const baseline = generateBaselineProjection(
    [],
    [unrelatedDebt, activeDebt],
    [
      { id: 30001, debt_id: 3001, apr_percentage: 6.25, start_date: '2026-01-01', end_date: null },
      { id: 30002, debt_id: 3002, apr_percentage: 12, start_date: '2026-01-01', end_date: null },
    ],
    '2026-01-01',
    6,
    null,
    [],
  );

  const rows = generateScenarioProjection(
    baseline.generated_rows,
    baseline.assumptions_snapshot,
    '2026-01-01',
    [],
    [{
      ...activeDebt,
      current_balance: 4000,
      actual_monthly_payment: 500,
    }],
    [],
    6,
    null,
  ).generated_rows;

  assert.equal(rows.some((row) => hasColumn(row, 'Fresh Validation Travel Rewards Card+')), false);
  assert.equal(rows.some((row) => hasColumn(row, 'Fresh Validation Travel Rewards Card Payment+')), false);
  assert.equal(rows.some((row) => hasColumn(row, 'Fresh Validation Travel Rewards Card Interest+')), false);
  assert.equal(rows.some((row) => hasColumn(row, 'Fresh Validation Travel Rewards Card Principal+')), false);
  assert.equal(rows.some((row) => hasColumn(row, 'Test 2+')), true);
  assert.equal(rows.some((row) => hasColumn(row, 'Test 2 Payment+')), true);
  assert.equal(rows.some((row) => hasColumn(row, 'Total Debt+')), true);
});

[
  ['monthly', 100],
  ['weekly', 500],
  ['bi_weekly', 300],
  ['first_and_fifteenth', 200],
  ['yearly', 100],
].forEach(([recurrence, expectedBill]) => {
  test(`recurring Other debt deviation with ${recurrence} recurrence creates bill-only impacts`, () => {
    const [row] = scenarioRowsForDebt(otherDebt({ recurrence }));

    assert.equal(hasColumn(row, 'Validation Bill Bill+'), false);
    assert.equal(row['Bills+'], expectedBill);
    assert.equal(row['Monthly Surplus+'], -expectedBill);
    assert.equal(row['Cash Balance+'], -expectedBill);
    assert.equal(hasColumn(row, 'Total Debt+'), false);
    assert.equal(hasColumn(row, 'Total Debt Payments+'), false);
    assert.equal(hasColumn(row, 'Total Interest Charged+'), false);
  });
});
