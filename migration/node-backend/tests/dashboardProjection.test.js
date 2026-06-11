const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { generateBaselineProjection } = require('../src/services/calculations/baselineProjection');
const dashboard = require('../src/services/calculations/dashboard');
const scenario = require('../src/services/calculations/scenarioProjection');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import copy
import json
import sys
from types import SimpleNamespace

from app.services.calculations import (
    dashboard_summary,
    first_of_month,
    generate_baseline_projection,
    generate_scenario_projection,
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

def saved_projection(case):
    kind = case["kind"]
    if kind == "raw":
        return case["saved"]

    if kind == "baseline":
        projection = generated_baseline(case)
        return {
            "id": case.get("id", 1),
            "projection_type": "baseline",
            "assumptions_snapshot": projection["assumptions_snapshot"],
            "generated_rows": projection["generated_rows"],
        }

    if kind == "scenario":
        payload = copy.deepcopy(case.get("payload", {}))
        baseline = generated_baseline(case)
        generated = generate_scenario_projection(
            baseline["generated_rows"],
            baseline["assumptions_snapshot"],
            normalize_month(payload.get("scenario_start_month")) or baseline["generated_rows"][0]["month"],
            payload.get("income_overrides") or [],
            payload.get("debt_overrides") or [],
            payload.get("interest_rate_overrides") or [],
            payload.get("months"),
            normalize_month(payload.get("scenario_end_month")),
        )
        return {
            "id": case.get("id", 1),
            "projection_type": "scenario",
            "assumptions_snapshot": generated["assumptions_snapshot"],
            "generated_rows": generated["generated_rows"],
        }

    raise ValueError(f"Unsupported kind: {kind}")

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    saved = SimpleNamespace(**saved_projection(case))
    results.append(dashboard_summary(saved))

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

function nodeSavedProjection(caseData) {
  switch (caseData.kind) {
    case 'raw':
      return caseData.saved;
    case 'baseline': {
      const projection = generatedBaseline(caseData);
      return {
        id: caseData.id ?? 1,
        projection_type: 'baseline',
        assumptions_snapshot: projection.assumptions_snapshot,
        generated_rows: projection.generated_rows,
      };
    }
    case 'scenario': {
      const payload = caseData.payload ?? {};
      const baselineProjection = generatedBaseline(caseData);
      const generated = scenario.generateScenarioProjection(
        baselineProjection.generated_rows,
        baselineProjection.assumptions_snapshot,
        scenario.normalizeScenarioMonth(payload.scenario_start_month) || baselineProjection.generated_rows[0].month,
        payload.income_overrides ?? [],
        payload.debt_overrides ?? [],
        payload.interest_rate_overrides ?? [],
        payload.months ?? null,
        scenario.normalizeScenarioMonth(payload.scenario_end_month),
      );
      return {
        id: caseData.id ?? 1,
        projection_type: 'scenario',
        assumptions_snapshot: generated.assumptions_snapshot,
        generated_rows: generated.generated_rows,
      };
    }
    default:
      throw new Error(`Unsupported kind: ${caseData.kind}`);
  }
}

function nodeResult(caseData) {
  return dashboard.dashboardSummary(nodeSavedProjection(caseData));
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
    amount: 100,
    start_date: '2026-01-01',
    end_date: null,
    frequency: 'monthly',
    active: true,
    ...overrides,
  };
}

function debt(overrides = {}) {
  return {
    id: 1,
    account_balance_id: 1,
    name: 'Long Debt',
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

function baselineCase(overrides = {}) {
  return {
    kind: 'baseline',
    id: 7,
    baseline: {
      start_month: '2026-01-01',
      months: 3,
      income_sources: [income()],
      debts: [
        debt(),
        debt({
          id: 2,
          name: 'Child Expenses',
          debt_type: 'other',
          current_balance: 0,
          minimum_monthly_payment: 25,
          actual_monthly_payment: 25,
          recurrence: 'monthly',
        }),
      ],
      interest_rates: [rate()],
      account_balances: [account()],
      ...overrides.baseline,
    },
  };
}

test('native dashboard summary matches FastAPI for empty saved projections', () => {
  assertParity([
    {
      kind: 'raw',
      saved: {
        id: 1,
        projection_type: 'baseline',
        assumptions_snapshot: {},
        generated_rows: [],
      },
    },
  ]);
});

test('native dashboard summary matches FastAPI for baseline payoff metadata and charts', () => {
  assertParity([baselineCase()]);
});

test('native dashboard summary matches FastAPI for scenario columns', () => {
  assertParity([
    baselineCase({
      baseline: {
        months: 4,
        income_sources: [income({ amount: 1000 })],
      },
      payload: {
        scenario_start_month: '2026-02-01',
        income_overrides: [
          income({ id: 1, amount: 1500, start_date: '2026-01-01' }),
        ],
      },
      kind: 'scenario',
      id: 8,
    }),
  ]);
});

test('native dashboard summary preserves Remaining Cash compatibility fallbacks', () => {
  assertParity([
    {
      kind: 'raw',
      saved: {
        id: 9,
        projection_type: 'baseline',
        assumptions_snapshot: {},
        generated_rows: [
          {
            month: '2026-01-01',
            Income: 100,
            'Total Debt': 0,
            'Total Debt Payments': 0,
            Bills: 0,
            'Total Interest Charged': 0,
            'Remaining Cash': 25,
            'Cash Balance': 125,
            'Debts Paid Off': [],
          },
          {
            month: '2026-02-01',
            Income: 100,
            'Total Debt': 0,
            'Total Debt Payments': 0,
            Bills: 0,
            'Total Interest Charged': 0,
            'Remaining Cash': -10,
            'Cash Balance': 115,
            'Debts Paid Off': [],
          },
        ],
      },
    },
  ]);
});

test('native chart endpoint payload is the dashboard datasets slice', () => {
  const summary = nodeResult(baselineCase());
  assert.deepEqual(summary.datasets, dashboard.dashboardSummary(nodeSavedProjection(baselineCase())).datasets);
});
