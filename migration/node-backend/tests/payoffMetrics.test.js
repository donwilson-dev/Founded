const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const payoff = require('../src/services/calculations/payoffMetrics');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import json
import sys

from app.services.calculations import (
    _ordered_active_debts,
    _remaining_cash_by_month,
    calculate_payoff_metrics,
)

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    op = case["op"]
    if op == "remaining_cash_by_month":
        results.append(_remaining_cash_by_month(case.get("projection_rows")))
    elif op == "ordered_active_debts":
        results.append([debt.get("id") for debt in _ordered_active_debts(case.get("debts", []))])
    elif op == "calculate_payoff_metrics":
        results.append(
            calculate_payoff_metrics(
                case.get("debts", []),
                case.get("interest_rates", []),
                case["start_month"],
                case.get("projection_rows"),
                case.get("max_months", 300),
            )
        )
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

function nodeResult(caseData) {
  switch (caseData.op) {
    case 'remaining_cash_by_month':
      return payoff.remainingCashByMonth(caseData.projection_rows);
    case 'ordered_active_debts':
      return payoff.orderedActiveDebts(caseData.debts ?? []).map((debt) => debt.id);
    case 'calculate_payoff_metrics':
      return payoff.calculatePayoffMetrics(
        caseData.debts ?? [],
        caseData.interest_rates ?? [],
        caseData.start_month,
        caseData.projection_rows,
        caseData.max_months ?? 300,
      );
    default:
      throw new Error(`Unsupported operation: ${caseData.op}`);
  }
}

function assertParity(cases) {
  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
}

function debt(overrides = {}) {
  return {
    id: 1,
    name: 'Card',
    debt_type: 'credit_card',
    current_balance: 1000,
    minimum_monthly_payment: 100,
    planned_extra_payment: 0,
    start_date: '2026-01-01',
    priority_number: 1,
    active: true,
    ...overrides,
  };
}

test('remaining-cash compatibility helper matches FastAPI fallbacks', () => {
  const cases = [
    { op: 'remaining_cash_by_month', projection_rows: null },
    {
      op: 'remaining_cash_by_month',
      projection_rows: [
        { month: '2026-01-01', 'Monthly Surplus': 250 },
        { month: '2026-02-01', 'Remaining Cash': 125 },
        { month: '2026-03-01', 'Monthly Surplus': 0, 'Remaining Cash': 999 },
        { 'Monthly Surplus': 300 },
      ],
    },
  ];

  assertParity(cases);
});

test('payoff ordering helper matches FastAPI priority, balance, activity, and type rules', () => {
  const debts = [
    debt({ id: 1, name: 'No Priority High Balance', current_balance: 5000, priority_number: null }),
    debt({ id: 2, name: 'Priority Two', current_balance: 100, priority_number: 2 }),
    debt({ id: 3, name: 'Priority One', current_balance: 1000, priority_number: 1 }),
    debt({ id: 4, name: 'Priority Two Low Balance', current_balance: 50, priority_number: 2 }),
    debt({ id: 5, name: 'Bill', debt_type: 'other', current_balance: 1000, priority_number: 0 }),
    debt({ id: 6, name: 'Inactive', current_balance: 10, priority_number: 0, active: false }),
    debt({ id: 7, name: 'Zero Priority', current_balance: 1, priority_number: 0 }),
  ];
  const cases = [{ op: 'ordered_active_debts', debts }];

  assertParity(cases);
});

test('payoff metrics match FastAPI no-debt, zero-balance, and negative-balance cases', () => {
  const cases = [
    { op: 'calculate_payoff_metrics', debts: [], interest_rates: [], start_month: '2026-01-01' },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: 0 })],
      interest_rates: [],
      start_month: '2026-01-01',
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: -100 })],
      interest_rates: [],
      start_month: '2026-01-01',
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ debt_type: 'other', current_balance: 1000 })],
      interest_rates: [],
      start_month: '2026-01-01',
    },
  ];

  assertParity(cases);
});

test('payoff metrics match FastAPI immediate and future payoff behavior with surplus', () => {
  const cases = [
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: 1000, minimum_monthly_payment: 100 })],
      interest_rates: [],
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 900 }],
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: 1000, minimum_monthly_payment: 100 })],
      interest_rates: [],
      start_month: '2026-01-01',
      projection_rows: [
        { month: '2026-01-01', 'Monthly Surplus': 0 },
        { month: '2026-02-01', 'Monthly Surplus': 0 },
      ],
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [
        debt({ id: 1, current_balance: 300, minimum_monthly_payment: 100, priority_number: 1 }),
        debt({ id: 2, name: 'Loan', current_balance: 500, minimum_monthly_payment: 100, priority_number: 2 }),
      ],
      interest_rates: [],
      start_month: '2026-01-01',
      projection_rows: [
        { month: '2026-01-01', 'Remaining Cash': 50 },
        { month: '2026-02-01', 'Remaining Cash': 50 },
      ],
    },
  ];

  assertParity(cases);
});

test('payoff metrics keep same-name debts without ids in separate payoff balances', () => {
  const result = payoff.calculatePayoffMetrics(
    [
      debt({
        id: undefined,
        name: 'Duplicate',
        current_balance: 100,
        minimum_monthly_payment: 100,
        priority_number: 1,
      }),
      debt({
        id: undefined,
        name: 'Duplicate',
        current_balance: 200,
        minimum_monthly_payment: 100,
        priority_number: 2,
      }),
    ],
    [],
    '2026-01-01',
    [{ month: '2026-01-01', 'Monthly Surplus': 0 }],
    12,
  );

  assert.deepEqual(result, {
    payoffMonth: '2026-02-01',
    monthsToDebtFree: 2,
    totalProjectedInterest: 0,
    payoffStatus: 'paid_off',
  });
});

test('payoff metrics match FastAPI APR, promo APR, zero APR, and missing APR cases', () => {
  const rates = [
    { id: 1, debt_id: 1, apr_percentage: 24, start_date: '2026-01-01', end_date: null },
    { id: 2, debt_id: 1, apr_percentage: 0.99, start_date: '2026-01-01', end_date: '2026-02-28' },
    { id: 3, debt_id: 2, apr_percentage: 0, start_date: '2026-01-01', end_date: null },
  ];
  const cases = [
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ id: 1, current_balance: 1000, minimum_monthly_payment: 250 })],
      interest_rates: rates,
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0 }],
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ id: 2, current_balance: 1000, minimum_monthly_payment: 250 })],
      interest_rates: rates,
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0 }],
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ id: 3, current_balance: 1000, minimum_monthly_payment: 250 })],
      interest_rates: rates,
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0 }],
    },
  ];

  assertParity(cases);
});

test('payoff metrics match FastAPI no-payoff and inactive-start compatibility cases', () => {
  const cases = [
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: 10000, minimum_monthly_payment: 10 })],
      interest_rates: [{ id: 1, debt_id: 1, apr_percentage: 60, start_date: '2026-01-01', end_date: null }],
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Remaining Cash': 0 }],
      max_months: 12,
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: 500, minimum_monthly_payment: 100, start_date: '2026-03-01' })],
      interest_rates: [],
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0 }],
      max_months: 12,
    },
    {
      op: 'calculate_payoff_metrics',
      debts: [debt({ current_balance: 500, minimum_monthly_payment: 0 })],
      interest_rates: [],
      start_month: '2026-01-01',
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0 }],
      max_months: 12,
    },
  ];

  assertParity(cases);
});
