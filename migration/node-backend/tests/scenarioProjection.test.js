const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { generateBaselineProjection } = require('../src/services/calculations/baselineProjection');
const scenario = require('../src/services/calculations/scenarioProjection');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import copy
import json
import sys

from app.services.calculations import (
    first_of_month,
    generate_baseline_projection,
    generate_scenario_projection,
    json_ready,
)

def normalize_month(value):
    if value is None:
        return None
    return first_of_month(value).isoformat()

def generated_baseline(case):
    baseline = case.get("baseline", {})
    return generate_baseline_projection(
        copy.deepcopy(baseline.get("income_sources", [])),
        copy.deepcopy(baseline.get("debts", [])),
        copy.deepcopy(baseline.get("interest_rates", [])),
        baseline["start_month"],
        baseline.get("months", 60),
        baseline.get("end_month"),
        copy.deepcopy(baseline.get("account_balances", [])),
        baseline.get("include_extended_payoff", True),
    )

def generate_response(case):
    payload = copy.deepcopy(case.get("payload", {}))
    baseline_projection = generated_baseline(case)
    generated = generate_scenario_projection(
        baseline_projection["generated_rows"],
        baseline_projection["assumptions_snapshot"],
        normalize_month(payload.get("scenario_start_month")) or baseline_projection["generated_rows"][0]["month"],
        payload.get("income_overrides") or [],
        payload.get("debt_overrides") or [],
        payload.get("interest_rate_overrides") or [],
        payload.get("months"),
        normalize_month(payload.get("scenario_end_month")),
    )
    generated["assumptions_snapshot"]["baseline_projection_id"] = payload.get("baseline_projection_id")
    generated["assumptions_snapshot"]["scenario_overrides"] = json_ready({
        "income_overrides": payload.get("income_overrides") or [],
        "debt_overrides": payload.get("debt_overrides") or [],
        "interest_rate_overrides": payload.get("interest_rate_overrides") or [],
        "scenario_start_month": normalize_month(payload.get("scenario_start_month")),
        "scenario_end_month": normalize_month(payload.get("scenario_end_month")),
        "months": payload.get("months"),
    })
    return generated

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    op = case["op"]
    if op == "generate_scenario_projection":
        payload = copy.deepcopy(case.get("payload", {}))
        baseline_projection = generated_baseline(case)
        results.append(generate_scenario_projection(
            baseline_projection["generated_rows"],
            baseline_projection["assumptions_snapshot"],
            normalize_month(payload.get("scenario_start_month")) or baseline_projection["generated_rows"][0]["month"],
            payload.get("income_overrides") or [],
            payload.get("debt_overrides") or [],
            payload.get("interest_rate_overrides") or [],
            payload.get("months"),
            normalize_month(payload.get("scenario_end_month")),
        ))
    elif op == "build_scenario_response":
        results.append(generate_response(case))
    elif op == "build_scenario_save_payload":
        generated = generate_response(case)
        baseline = case.get("baseline", {})
        payload = case.get("payload", {})
        title = (payload.get("title") or f"{baseline.get('title', 'Baseline')} Scenario").strip()
        results.append({
            "title": title,
            "projection_type": "scenario",
            "notes": payload.get("notes"),
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        })
    else:
        raise ValueError(f"Unsupported operation: {op}")

print(json.dumps(results))
`;

function pythonResults(cases) {
  const output = execFileSync(pythonExe, ['-c', pythonParityScript], {
    cwd: repoRoot,
    input: JSON.stringify(cases),
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

function generatedBaseline(caseData) {
  const baseline = caseData.baseline ?? {};
  return generateBaselineProjection(
    baseline.income_sources ?? [],
    baseline.debts ?? [],
    baseline.interest_rates ?? [],
    baseline.start_month,
    baseline.months ?? 60,
    baseline.end_month ?? null,
    baseline.account_balances ?? [],
    baseline.include_extended_payoff ?? true,
  );
}

function nodeResult(caseData) {
  const payload = caseData.payload ?? {};
  const baselineProjection = generatedBaseline(caseData);
  const projectionForResponse = {
    ...baselineProjection,
    title: caseData.baseline?.title || 'Baseline',
  };

  switch (caseData.op) {
    case 'generate_scenario_projection':
      return scenario.generateScenarioProjection(
        baselineProjection.generated_rows,
        baselineProjection.assumptions_snapshot,
        scenario.normalizeScenarioMonth(payload.scenario_start_month) || baselineProjection.generated_rows[0].month,
        payload.income_overrides ?? [],
        payload.debt_overrides ?? [],
        payload.interest_rate_overrides ?? [],
        payload.months ?? null,
        scenario.normalizeScenarioMonth(payload.scenario_end_month),
      );
    case 'build_scenario_response':
      return scenario.buildScenarioGenerationResponse(projectionForResponse, payload);
    case 'build_scenario_save_payload':
      return scenario.buildScenarioSavePayload(projectionForResponse, payload);
    default:
      throw new Error(`Unsupported operation: ${caseData.op}`);
  }
}

function assertParity(cases) {
  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
}

function account(overrides = {}) {
  return {
    id: 1,
    name: 'Checking',
    owner: 'Alex',
    account_type: 'Checking',
    amount: 1000,
    date: '2026-01-01',
    active: true,
    ...overrides,
  };
}

function income(overrides = {}) {
  return {
    id: 1,
    account_balance_id: 1,
    label: 'Salary',
    amount: 3000,
    start_date: '2026-01-01',
    end_date: null,
    frequency: 'monthly',
    active: true,
    ...overrides,
  };
}

function transfer(overrides = {}) {
  return income({
    id: 2,
    account_balance_id: null,
    label: 'Transfer',
    amount: 200,
    is_account_transfer: true,
    from_account_id: 1,
    to_account_id: 2,
    ...overrides,
  });
}

function debt(overrides = {}) {
  return {
    id: 1,
    account_balance_id: 1,
    name: 'Card',
    debt_type: 'credit_card',
    current_balance: 1000,
    minimum_monthly_payment: 100,
    actual_monthly_payment: null,
    planned_extra_payment: 0,
    start_date: '2026-01-01',
    payoff_target_date: null,
    priority_number: 1,
    active: true,
    ...overrides,
  };
}

function rate(overrides = {}) {
  return {
    id: 1,
    debt_id: 1,
    apr_percentage: 12,
    start_date: '2026-01-01',
    end_date: null,
    ...overrides,
  };
}

function baseCase(overrides = {}) {
  return {
    baseline: {
      title: 'Actual',
      start_month: '2026-01-01',
      months: 6,
      income_sources: [income()],
      debts: [debt()],
      interest_rates: [rate()],
      account_balances: [account()],
      ...overrides.baseline,
    },
    payload: {
      baseline_projection_id: 1,
      scenario_start_month: null,
      scenario_end_month: null,
      months: null,
      income_overrides: [],
      debt_overrides: [],
      interest_rate_overrides: [],
      title: null,
      notes: null,
      ...overrides.payload,
    },
  };
}

function assertNoScenarioDeltas(result, debtName = null) {
  for (const row of result.generated_rows) {
    const comparisonKeys = Object.keys(row).filter((key) => key.endsWith('+') || key.endsWith(' Difference'));
    assert.deepEqual(comparisonKeys, [], `zero-impact scenario should not emit comparison fields for ${row.month}`);
    if (debtName) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, `${debtName}+`), false);
      assert.equal(Object.prototype.hasOwnProperty.call(row, `${debtName} Payment+`), false);
    }
  }
}

test('native scenario projection matches FastAPI for no deviations and default timeline', () => {
  assertParity([
    {
      op: 'generate_scenario_projection',
      ...baseCase(),
    },
  ]);
});

test('native scenario projection uses explicit actual payment for debt deviations', () => {
  const baselineProjection = generateBaselineProjection(
    [income({ amount: 2000, frequency: 'monthly' })],
    [debt({ id: 1, current_balance: 1000, minimum_monthly_payment: 100, actual_monthly_payment: 0 })],
    [rate({ id: 1, debt_id: 1, apr_percentage: 0 })],
    '2026-01-01',
    1,
  );

  const result = scenario.generateScenarioProjection(
    baselineProjection.generated_rows,
    baselineProjection.assumptions_snapshot,
    '2026-01-01',
    [],
    [
      debt({
        id: null,
        name: 'Actual Only',
        current_balance: 1000,
        minimum_monthly_payment: 0,
        actual_monthly_payment: 500,
        planned_extra_payment: 0,
        priority_number: 2,
      }),
    ],
    [],
    1,
  );

  assert.equal(result.generated_rows[0]['Total Debt Payments+'], 600);
});

test('native scenario projection matches FastAPI income overrides and end-month windows', () => {
  assertParity([
    {
      op: 'generate_scenario_projection',
      ...baseCase({
        payload: {
          scenario_start_month: '2026-02-15',
          scenario_end_month: '2026-04-30',
          income_overrides: [
            income({ id: 1, label: 'Salary', amount: 3500, start_date: '2026-01-01' }),
            income({ id: null, account_balance_id: 1, label: 'Bonus', amount: 1200, start_date: '2026-03-01', frequency: 'one_time' }),
          ],
        },
      }),
    },
  ]);
});

test('native scenario projection matches FastAPI debt overrides, new debts, and APR schedules', () => {
  assertParity([
    {
      op: 'generate_scenario_projection',
      ...baseCase({
        baseline: {
          debts: [
            debt({ id: 1, name: 'Card', current_balance: 2000, minimum_monthly_payment: 150, priority_number: 1 }),
            debt({ id: 2, name: 'Loan', debt_type: 'vehicle_loan', current_balance: 5000, minimum_monthly_payment: 300, priority_number: 2 }),
          ],
          interest_rates: [
            rate({ id: 1, debt_id: 1, apr_percentage: 24 }),
            rate({ id: 2, debt_id: 1, apr_percentage: 0.99, start_date: '2026-01-01', end_date: '2026-02-28' }),
            rate({ id: 3, debt_id: 2, apr_percentage: 8 }),
          ],
        },
        payload: {
          scenario_start_month: '2026-03-01',
          debt_overrides: [
            debt({ id: 1, name: 'Card', current_balance: 1500, minimum_monthly_payment: 200, actual_monthly_payment: 250 }),
            debt({ id: null, account_balance_id: 1, name: 'New Card', debt_type: 'credit_card', current_balance: 750, minimum_monthly_payment: 75, priority_number: 3 }),
          ],
          interest_rate_overrides: [
            rate({ id: null, debt_id: null, apr_percentage: 19.99, start_date: '2026-03-01' }),
          ],
        },
      }),
    },
  ]);
});

test('native scenario projection preserves baseline debt identity when adding a same-name debt', () => {
  const caseData = baseCase({
    baseline: {
      months: 4,
      debts: [
        debt({
          id: 1,
          name: 'Card',
          current_balance: 1000,
          minimum_monthly_payment: 100,
          actual_monthly_payment: 100,
        }),
      ],
      interest_rates: [],
    },
    payload: {
      scenario_start_month: '2026-03-01',
      months: 1,
      debt_overrides: [
        debt({
          id: null,
          name: 'Card',
          current_balance: 300,
          minimum_monthly_payment: 50,
          actual_monthly_payment: 50,
          priority_number: 2,
          start_date: '2026-03-01',
        }),
      ],
    },
  });

  const result = nodeResult({ op: 'generate_scenario_projection', ...caseData });
  const march = result.generated_rows.find((row) => row.month === '2026-03-01');

  assert.equal(march['Card+'], 700);
  assert.equal(march['Card Payment+'], 100);
  assert.equal(march['Card (Credit Card - $50/mo)+'], 250);
  assert.equal(march['Card (Credit Card - $50/mo) Payment+'], 50);
  assert.equal(march['Total Debt Payments+'], 150);
  assert.equal(march['Total Debt+'], 950);
  assert.equal(Object.prototype.hasOwnProperty.call(march, 'Card (Credit Card - $100/mo)+'), false);
});

test('native scenario projection ignores inactive overrides but preserves them in the snapshot', () => {
  const caseData = baseCase({
    payload: {
      income_overrides: [
        income({ id: 1, label: 'Salary', amount: 4500, active: false }),
      ],
      debt_overrides: [
        debt({ id: 1, name: 'Card', current_balance: 500, minimum_monthly_payment: 500, active: false }),
      ],
      interest_rate_overrides: [
        rate({ id: 2, debt_id: 1, apr_percentage: 0 }),
      ],
    },
  });

  const result = nodeResult({ op: 'build_scenario_response', ...caseData });
  const firstRow = result.generated_rows[0];

  assert.equal(firstRow.Income, 3000);
  assert.equal(firstRow['Income+'], 3000);
  assert.equal(firstRow['Total Debt Payments'], 100);
  assert.equal(firstRow['Total Debt Payments+'], 100);
  assert.equal(result.assumptions_snapshot.scenario_overrides.income_overrides[0].active, false);
  assert.equal(result.assumptions_snapshot.scenario_overrides.debt_overrides[0].active, false);
});

test('native scenario projection ignores inactive debt APR overrides linked by native legacy id', () => {
  const caseData = baseCase({
    payload: {
      debt_overrides: [
        debt({
          id: 'native-debt-id',
          legacyId: 1,
          name: 'Card',
          current_balance: 500,
          minimum_monthly_payment: 500,
          active: false,
        }),
      ],
      interest_rate_overrides: [
        rate({ debt_id: 1, apr_percentage: 0 }),
      ],
    },
  });

  const result = nodeResult({ op: 'build_scenario_response', ...caseData });
  const firstRow = result.generated_rows[0];

  assert.equal(firstRow['Total Debt Payments'], firstRow['Total Debt Payments+']);
  assert.equal(firstRow['Total Interest Charged'], firstRow['Total Interest Charged+']);
  assert.equal(firstRow['Total Debt'], firstRow['Total Debt+']);
  assert.equal(firstRow['Monthly Surplus'], firstRow['Monthly Surplus+']);
  assert.equal(firstRow['Cash Balance'], firstRow['Cash Balance+']);
  assert.equal(result.assumptions_snapshot.scenario_overrides.debt_overrides[0].active, false);
});

test('native scenario projection preserves saved baseline debt metrics when no debt deviations are active', () => {
  const caseData = baseCase({ baseline: { months: 3 } });
  const baselineProjection = generatedBaseline(caseData);
  baselineProjection.generated_rows = baselineProjection.generated_rows.map((row, index) => ({
    ...row,
    Income: 3000,
    'Total Debt Payments': 220 + index,
    Bills: 30,
    'Total Interest Charged': 440 + index,
    'Total Debt': 5400 - index,
    'Monthly Surplus': 2750 - index,
    'Cash Balance': 3750 + index,
  }));

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({ id: 1, current_balance: 500, minimum_monthly_payment: 500, active: false }),
      ],
      interest_rate_overrides: [
        rate({ id: 2, debt_id: 1, apr_percentage: 0 }),
      ],
    },
  );
  const firstRow = result.generated_rows[0];

  assert.equal(firstRow['Total Debt Payments+'], firstRow['Total Debt Payments']);
  assert.equal(firstRow['Total Interest Charged+'], firstRow['Total Interest Charged']);
  assert.equal(firstRow['Total Debt+'], firstRow['Total Debt']);
  assert.equal(firstRow['Monthly Surplus+'], firstRow['Monthly Surplus']);
  assert.equal(firstRow['Cash Balance+'], firstRow['Cash Balance']);
});

test('native scenario projection preserves baseline debt metrics for income-only scenarios', () => {
  const caseData = baseCase({ baseline: { months: 3 } });
  const baselineProjection = generatedBaseline(caseData);
  baselineProjection.generated_rows = baselineProjection.generated_rows.map((row, index) => ({
    ...row,
    Income: 3000,
    'Total Debt Payments': 220 + index,
    Bills: 30,
    'Total Interest Charged': 440 + index,
    'Total Debt': 5400 - index,
    'Monthly Surplus': 2750 - index,
    'Cash Balance': 3750 + index,
  }));

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      income_overrides: [
        income({ id: 1, label: 'Salary', amount: 3500 }),
      ],
      debt_overrides: [
        debt({ id: 1, current_balance: 500, minimum_monthly_payment: 500, active: false }),
      ],
      interest_rate_overrides: [
        rate({ id: 2, debt_id: 1, apr_percentage: 0 }),
      ],
    },
  );
  const firstRow = result.generated_rows[0];

  assert.equal(firstRow['Total Debt Payments+'], firstRow['Total Debt Payments']);
  assert.equal(firstRow['Total Interest Charged+'], firstRow['Total Interest Charged']);
  assert.equal(firstRow['Total Debt+'], firstRow['Total Debt']);
  assert.equal(firstRow['Income+'], 3500);
  assert.equal(firstRow['Monthly Surplus+'], 3250);
  assert.equal(firstRow['Cash Balance+'], 4250);
});

test('native scenario projection preserves saved baseline debt metrics for active income-only scenarios', () => {
  const caseData = baseCase({ baseline: { months: 3 } });
  const baselineProjection = generatedBaseline(caseData);
  baselineProjection.generated_rows = baselineProjection.generated_rows.map((row, index) => ({
    ...row,
    Income: 3000,
    Card: 800 - index,
    'Card Payment': 125,
    'Card Interest': 41 + index,
    'Card Principal': 84 - index,
    'Total Debt Payments': 125,
    Bills: 45,
    'Total Interest Charged': 41 + index,
    'Total Debt': 800 - index,
    'Monthly Surplus': 2830,
    'Cash Balance': 3830 + (index * 2830),
  }));

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      income_overrides: [
        income({ id: 1, label: 'Salary', amount: 3500 }),
      ],
      debt_overrides: [],
      interest_rate_overrides: [],
    },
  );
  const firstRow = result.generated_rows[0];

  assert.equal(firstRow['Income+'], 3500);
  assert.equal(firstRow['Card+'], firstRow.Card);
  assert.equal(firstRow['Card Payment+'], firstRow['Card Payment']);
  assert.equal(firstRow['Card Interest+'], firstRow['Card Interest']);
  assert.equal(firstRow['Card Principal+'], firstRow['Card Principal']);
  assert.equal(firstRow['Total Debt Payments+'], firstRow['Total Debt Payments']);
  assert.equal(firstRow['Total Interest Charged+'], firstRow['Total Interest Charged']);
  assert.equal(firstRow['Total Debt+'], firstRow['Total Debt']);
  assert.equal(firstRow['Card Difference'], 0);
  assert.equal(firstRow['Card Payment Difference'], 0);
  assert.equal(firstRow['Total Debt Payments Difference'], 0);
  assert.equal(firstRow['Total Interest Charged Difference'], 0);
  assert.equal(firstRow['Total Debt Difference'], 0);
  assert.equal(firstRow['Monthly Surplus+'], 3330);
  assert.equal(firstRow['Monthly Surplus Difference'], 500);
  assert.equal(firstRow['Cash Balance+'], 4330);
  assert.equal(firstRow['Cash Balance Difference'], 500);
});

test('native scenario projection preserves saved baseline rows when income overrides are inactive', () => {
  const caseData = baseCase({ baseline: { months: 3 } });
  const baselineProjection = generatedBaseline(caseData);
  baselineProjection.generated_rows = baselineProjection.generated_rows.map((row, index) => ({
    ...row,
    Income: 3000,
    Card: 700 - index,
    'Card Payment': 90 + index,
    'Card Interest': 25 + index,
    'Card Principal': 65,
    'Total Debt Payments': 90 + index,
    Bills: 30,
    'Total Interest Charged': 25 + index,
    'Total Debt': 700 - index,
    'Monthly Surplus': 2880 - index,
    'Cash Balance': 3880 + index,
  }));

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      income_overrides: [
        income({ id: 1, label: 'Salary', amount: 3500, active: false }),
      ],
    },
  );
  const firstRow = result.generated_rows[0];

  assert.equal(firstRow['Income+'], firstRow.Income);
  assert.equal(firstRow['Card+'], firstRow.Card);
  assert.equal(firstRow['Card Payment+'], firstRow['Card Payment']);
  assert.equal(firstRow['Card Interest+'], firstRow['Card Interest']);
  assert.equal(firstRow['Card Principal+'], firstRow['Card Principal']);
  assert.equal(firstRow['Total Debt Payments+'], firstRow['Total Debt Payments']);
  assert.equal(firstRow['Total Interest Charged+'], firstRow['Total Interest Charged']);
  assert.equal(firstRow['Total Debt+'], firstRow['Total Debt']);
  assert.equal(firstRow['Monthly Surplus+'], firstRow['Monthly Surplus']);
  assert.equal(firstRow['Cash Balance+'], firstRow['Cash Balance']);
  assert.equal(firstRow['Income Difference'], 0);
  assert.equal(firstRow['Total Interest Charged Difference'], 0);
  assert.equal(firstRow['Total Debt Difference'], 0);
  assert.equal(firstRow['Monthly Surplus Difference'], 0);
  assert.equal(firstRow['Cash Balance Difference'], 0);
});

test('native scenario projection matches FastAPI account transfers and other-debt bills', () => {
  assertParity([
    {
      op: 'generate_scenario_projection',
      ...baseCase({
        baseline: {
          income_sources: [
            income({ id: 1, account_balance_id: 1, amount: 3000 }),
            transfer({ id: 2, amount: 200, frequency: 'monthly', from_account_id: 1, to_account_id: 2 }),
          ],
          debts: [
            debt({ id: 1, account_balance_id: 1, name: 'Card', current_balance: 1000, minimum_monthly_payment: 200 }),
            debt({ id: 2, account_balance_id: 2, name: 'Rent', debt_type: 'other', current_balance: 0, minimum_monthly_payment: 700, actual_monthly_payment: 700, recurrence: 'monthly' }),
          ],
          account_balances: [
            account({ id: 1, name: 'Don Checking', owner: 'Don', amount: 1000 }),
            account({ id: 2, name: 'Joint Checking', owner: 'Joint', amount: 500 }),
          ],
        },
        payload: {
          scenario_start_month: '2026-02-01',
          income_overrides: [
            transfer({ id: 2, amount: 300, frequency: 'first_and_fifteenth', from_account_id: 1, to_account_id: 2, start_date: '2026-02-01', end_date: '2026-03-14' }),
          ],
          debt_overrides: [
            debt({ id: 2, account_balance_id: 2, name: 'Rent', debt_type: 'other', current_balance: 0, minimum_monthly_payment: 800, actual_monthly_payment: 800, recurrence: 'monthly' }),
          ],
        },
      }),
    },
  ]);
});

test('active scenario target payoff override applies lump sum independently in target month', () => {
  const caseData = baseCase({
    baseline: {
      months: 4,
      income_sources: [income({ amount: 2000 })],
      debts: [debt({ current_balance: 1000, minimum_monthly_payment: 100 })],
      interest_rates: [rate({ apr_percentage: 0 })],
      account_balances: [account({ amount: 0 })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: 1,
          current_balance: 1000,
          minimum_monthly_payment: 100,
          planned_extra_payment: 0,
          payoff_target_date: '2026-04-01',
          target_payoff_active: true,
        }),
      ],
      interest_rate_overrides: [rate({ debt_id: 1, apr_percentage: 0 })],
    },
  );

  assert.equal(result.generated_rows[0]['Card Payment'], 100);
  assert.equal(result.generated_rows[0]['Card Payment+'], 100);
  assert.equal(result.generated_rows[1]['Card Payment+'], 100);
  assert.equal(result.generated_rows[2]['Card Payment+'], 100);
  assert.equal(result.generated_rows[3]['Card Payment'], 100);
  assert.equal(result.generated_rows[3]['Card'], 600);
  assert.equal(result.generated_rows[3]['Card Payment+'], 700);
  assert.equal(result.generated_rows[3]['Card+'], 0);
  assert.deepEqual(result.generated_rows[3]['Debts Paid Off+'], ['Card']);
  assert.equal(result.summary.projected_payoff_date, '2026-04-01');
});

test('active scenario target payoff accepts a future date within the target month', () => {
  const caseData = baseCase({
    baseline: {
      start_month: '2026-06-01',
      months: 4,
      income_sources: [income({ start_date: '2026-06-01', amount: 2000 })],
      debts: [
        debt({
          start_date: '2026-06-01',
          current_balance: 4300,
          minimum_monthly_payment: 125,
          planned_extra_payment: 475,
        }),
      ],
      interest_rates: [rate({ start_date: '2026-06-01', apr_percentage: 0 })],
      account_balances: [account({ amount: 0, date: '2026-06-01' })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: 1,
          start_date: '2026-06-01',
          current_balance: 4300,
          minimum_monthly_payment: 125,
          planned_extra_payment: 475,
          payoff_target_date: '2026-08-12',
          target_payoff_active: true,
        }),
      ],
      interest_rate_overrides: [rate({ debt_id: 1, start_date: '2026-06-01', apr_percentage: 0 })],
    },
  );

  assert.equal(result.generated_rows[0]['Card Payment+'], 600);
  assert.equal(result.generated_rows[1]['Card Payment+'], 600);
  assert.equal(result.generated_rows[2]['Card Payment+'], 3100);
  assert.equal(result.generated_rows[2]['Card+'], 0);
  assert.equal(result.generated_rows[2]['Monthly Surplus+'], -1100);
  assert.equal(result.generated_rows[2]['Cash Balance+'], 1700);
  assert.equal(result.scenario_account_projection_rows[2].accounts[0].debt_payments, 3100);
  assert.equal(result.scenario_account_projection_rows[2].accounts[0].cash_balance, 1700);
  assert.deepEqual(result.generated_rows[2]['Debts Paid Off+'], ['Card']);
  assert.equal(result.summary.projected_payoff_date, '2026-08-01');
});

test('active scenario target payoff does not redistribute screenshot-scale payments before target month', () => {
  const caseData = baseCase({
    baseline: {
      start_month: '2026-06-01',
      months: 4,
      income_sources: [income({ start_date: '2026-06-01', amount: 12000 })],
      debts: [
        debt({
          id: 1,
          name: 'Travel Rewards Card',
          start_date: '2026-01-01',
          current_balance: 15000,
          minimum_monthly_payment: 125,
          planned_extra_payment: 175,
        }),
      ],
      interest_rates: [rate({ debt_id: 1, start_date: '2026-01-01', apr_percentage: 12 })],
      account_balances: [account({ amount: 0, date: '2026-06-01' })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: 1,
          name: 'Travel Rewards Card2',
          start_date: '2026-01-01',
          current_balance: 14300,
          minimum_monthly_payment: 125,
          planned_extra_payment: 475,
          payoff_target_date: '2026-08-12',
          target_payoff_active: true,
        }),
      ],
      interest_rate_overrides: [rate({ debt_id: 1, start_date: '2026-01-01', apr_percentage: 12 })],
    },
  );

  assert.equal(result.generated_rows[0]['Travel Rewards Card2 Payment+'], 600);
  assert.notEqual(result.generated_rows[0]['Travel Rewards Card2 Payment+'], 4862);
  assert.equal(result.generated_rows[1]['Travel Rewards Card2 Payment+'], 600);
  assert.notEqual(result.generated_rows[1]['Travel Rewards Card2 Payment+'], 4862);
  assert.equal(result.generated_rows[2]['Travel Rewards Card2 Payment+'] > 600, true);
  assert.equal(result.generated_rows[2]['Travel Rewards Card2+'], 0);
  assert.deepEqual(result.generated_rows[2]['Debts Paid Off+'], ['Travel Rewards Card2']);
});

test('inactive scenario target payoff override preserves baseline debt metrics', () => {
  const caseData = baseCase({
    baseline: {
      months: 4,
      income_sources: [income({ amount: 2000 })],
      debts: [debt({ current_balance: 1000, minimum_monthly_payment: 100 })],
      interest_rates: [rate({ apr_percentage: 0 })],
      account_balances: [account({ amount: 0 })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: 1,
          current_balance: 1000,
          minimum_monthly_payment: 100,
          payoff_target_date: '2026-04-01',
          target_payoff_active: true,
          active: false,
        }),
      ],
    },
  );

  for (const row of result.generated_rows) {
    assert.equal(row['Card+'], row.Card);
    assert.equal(row['Card Payment+'], row['Card Payment']);
    assert.equal(row['Total Debt+'], row['Total Debt']);
    assert.equal(row['Total Debt Payments+'], row['Total Debt Payments']);
  }
});

test('native scenario projection ignores new zero-balance APR debt overrides', () => {
  const aprDebtTypes = ['credit_card', 'vehicle_loan', 'personal_loan', 'student_loan'];

  for (const debtType of aprDebtTypes) {
    const caseData = baseCase({
      baseline: {
        start_month: '2026-06-01',
        months: 6,
        income_sources: [income({ amount: 4000, start_date: '2026-06-01' })],
        debts: [debt({
          id: 1,
          name: 'Card',
          current_balance: 1000,
          minimum_monthly_payment: 100,
          planned_extra_payment: 0,
          start_date: '2026-06-01',
        })],
        interest_rates: [rate({ debt_id: 1, apr_percentage: 12, start_date: '2026-06-01' })],
        account_balances: [account({ amount: 0, date: '2026-06-01' })],
      },
    });
    const baselineProjection = generatedBaseline(caseData);
    const result = scenario.buildScenarioGenerationResponse(
      { ...baselineProjection, title: 'Actual' },
      {
        baseline_projection_id: 1,
        debt_overrides: [
          debt({
            id: 99,
            name: `Registration ${debtType}`,
            debt_type: debtType,
            current_balance: 0,
            minimum_monthly_payment: 500,
            planned_extra_payment: 0,
            start_date: '2026-06-01',
            priority_number: 2,
          }),
        ],
        interest_rate_overrides: [
          rate({ id: 99, debt_id: 99, apr_percentage: 0, start_date: '2026-06-01' }),
        ],
      },
    );

    assertNoScenarioDeltas(result, `Registration ${debtType}`);
  }
});

test('native scenario projection ignores new zero-payment Other debt overrides', () => {
  const caseData = baseCase({
    baseline: {
      start_month: '2026-06-01',
      months: 6,
      income_sources: [income({ amount: 4000, start_date: '2026-06-01' })],
      debts: [debt({
        id: 1,
        name: 'Card',
        current_balance: 1000,
        minimum_monthly_payment: 100,
        planned_extra_payment: 0,
        start_date: '2026-06-01',
      })],
      interest_rates: [rate({ debt_id: 1, apr_percentage: 12, start_date: '2026-06-01' })],
      account_balances: [account({ amount: 0, date: '2026-06-01' })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);
  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: null,
          name: 'Registration',
          debt_type: 'other',
          current_balance: 0,
          minimum_monthly_payment: 0,
          planned_extra_payment: 0,
          actual_monthly_payment: 0,
          recurrence: 'yearly',
          start_date: '2026-06-01',
          payoff_target_date: null,
          priority_number: null,
        }),
      ],
    },
  );

  assertNoScenarioDeltas(result, 'Registration');
});

test('native scenario projection ignores new zero-balance Other debt overrides with scheduled payments', () => {
  const caseData = baseCase({
    baseline: {
      start_month: '2026-06-01',
      months: 6,
      income_sources: [income({ amount: 4000, start_date: '2026-06-01' })],
      debts: [debt({
        id: 1,
        name: 'Card',
        current_balance: 1000,
        minimum_monthly_payment: 100,
        planned_extra_payment: 0,
        start_date: '2026-06-01',
      })],
      interest_rates: [rate({ debt_id: 1, apr_percentage: 12, start_date: '2026-06-01' })],
      account_balances: [account({ amount: 0, date: '2026-06-01' })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);
  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: null,
          name: 'Registration',
          debt_type: 'other',
          current_balance: 0,
          minimum_monthly_payment: 150,
          actual_monthly_payment: 300,
          recurrence: 'yearly',
          start_date: '2026-06-01',
          payoff_target_date: null,
          priority_number: null,
        }),
      ],
    },
  );

  assertNoScenarioDeltas(result, 'Registration');
});

test('active existing scenario Other debt override applies yearly recurrence on anchored dates', () => {
  const caseData = baseCase({
    baseline: {
      start_month: '2026-03-01',
      months: 14,
      income_sources: [income({ amount: 1000, start_date: '2026-03-01' })],
      debts: [debt({
        id: 2,
        name: 'Annual Fee',
        debt_type: 'other',
        current_balance: 0,
        minimum_monthly_payment: 120,
        actual_monthly_payment: 120,
        recurrence: 'monthly',
        start_date: '2026-03-15',
        priority_number: null,
      })],
      interest_rates: [],
      account_balances: [account({ amount: 0 })],
    },
  });
  const baselineProjection = generatedBaseline(caseData);

  const result = scenario.buildScenarioGenerationResponse(
    { ...baselineProjection, title: 'Actual' },
    {
      baseline_projection_id: 1,
      debt_overrides: [
        debt({
          id: 2,
          name: 'Annual Fee',
          debt_type: 'other',
          current_balance: 0,
          minimum_monthly_payment: 120,
          actual_monthly_payment: 120,
          recurrence: 'yearly',
          start_date: '2026-03-15',
          payoff_target_date: '2027-03-15',
          priority_number: null,
        }),
      ],
    },
  );

  const rowsByMonth = Object.fromEntries(result.generated_rows.map((row) => [row.month, row]));
  assert.equal(rowsByMonth['2026-03-01']['Bills+'], 120);
  assert.equal(rowsByMonth['2026-04-01']['Bills+'], 0);
  assert.equal(rowsByMonth['2027-02-01']['Bills+'], 0);
  assert.equal(rowsByMonth['2027-03-01']['Bills+'], 120);
  assert.equal(rowsByMonth['2027-04-01']['Bills+'], 0);
});

test('native scenario response and save payload match FastAPI wrapper compatibility', () => {
  const caseData = baseCase({
    baseline: { title: 'Actual' },
    payload: {
      baseline_projection_id: 77,
      scenario_start_month: '2026-02-15',
      months: 3,
      income_overrides: [income({ id: 1, label: 'Salary', amount: 3600 })],
      title: 'Actual Scenario',
      notes: 'updated',
    },
  });

  assertParity([
    { op: 'build_scenario_response', ...caseData },
    { op: 'build_scenario_save_payload', ...caseData },
    { op: 'build_scenario_save_payload', ...baseCase({ baseline: { title: 'Baseline Name' } }) },
  ]);
});
