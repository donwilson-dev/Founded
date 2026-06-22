const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const baseline = require('../src/services/calculations/baselineProjection');
const baselineAdapter = require('../src/services/baselineEngineAdapter');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import json
import sys

from app.services.calculations import generate_baseline_projection

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    results.append(
        generate_baseline_projection(
            case.get("income_sources", []),
            case.get("debts", []),
            case.get("interest_rates", []),
            case["start_month"],
            case.get("months", 60),
            case.get("end_month"),
            case.get("account_balances"),
            case.get("include_extended_payoff", True),
        )
    )

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
  return baseline.generateBaselineProjection(
    caseData.income_sources ?? [],
    caseData.debts ?? [],
    caseData.interest_rates ?? [],
    caseData.start_month,
    caseData.months ?? 60,
    caseData.end_month ?? null,
    caseData.account_balances,
    caseData.include_extended_payoff ?? true,
  );
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
    amount: 1000,
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
    label: 'Household Transfer',
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

test('native baseline projection matches FastAPI for empty and income-only baselines', () => {
  const cases = [
    {
      start_month: '2026-01-01',
      months: 2,
      income_sources: [],
      debts: [],
      interest_rates: [],
      account_balances: [],
    },
    {
      start_month: '2026-01-01',
      end_month: '2026-03-01',
      income_sources: [
        income({ id: 1, amount: 1000, frequency: 'monthly' }),
        income({ id: 2, account_balance_id: 2, amount: 250, frequency: 'one_time', start_date: '2026-02-15' }),
      ],
      debts: [],
      interest_rates: [],
      account_balances: [
        account({ id: 1, amount: 500, date: '2025-12-15' }),
        account({ id: 2, name: 'Savings', amount: 250, date: '2026-02-01' }),
      ],
    },
  ];

  assertParity(cases);
});

test('native baseline projection matches FastAPI for duplicate debt labels, APRs, and bills', () => {
  const cases = [
    {
      start_month: '2026-01-01',
      months: 6,
      income_sources: [
        income({ id: 1, amount: 3000, frequency: 'monthly' }),
        income({ id: 2, account_balance_id: 2, amount: 1000, frequency: 'first_and_fifteenth', start_date: '2026-01-01' }),
      ],
      debts: [
        debt({ id: 1, name: 'Card', debt_type: 'credit_card', current_balance: 1000, minimum_monthly_payment: 100, actual_monthly_payment: 250, priority_number: 1 }),
        debt({ id: 2, name: 'Card', debt_type: 'credit_card', current_balance: 500, minimum_monthly_payment: 50, actual_monthly_payment: 125, priority_number: 2 }),
        debt({ id: 3, account_balance_id: 2, name: 'Utility', debt_type: 'other', current_balance: 0, minimum_monthly_payment: 80, actual_monthly_payment: 80, recurrence: 'weekly', start_date: '2026-01-01', priority_number: null }),
        debt({ id: 4, account_balance_id: 2, name: 'Future Loan', debt_type: 'personal_loan', current_balance: 600, minimum_monthly_payment: 75, start_date: '2026-03-01', priority_number: 3 }),
      ],
      interest_rates: [
        rate({ id: 1, debt_id: 1, apr_percentage: 24, start_date: '2026-01-01', end_date: null }),
        rate({ id: 2, debt_id: 1, apr_percentage: 0.99, start_date: '2026-01-01', end_date: '2026-02-28' }),
        rate({ id: 3, debt_id: 2, apr_percentage: 12.5, start_date: '2026-01-01', end_date: null }),
        rate({ id: 4, debt_id: 4, apr_percentage: 9, start_date: '2026-03-01', end_date: null }),
      ],
      account_balances: [
        account({ id: 1, amount: 2000, date: '2025-12-01' }),
        account({ id: 2, name: 'Joint', owner: 'Joint', amount: 500, date: '2026-01-01' }),
      ],
    },
  ];

  assertParity(cases);
});

test('native baseline projection uses explicit actual payment over minimum payment', () => {
  const result = baseline.generateBaselineProjection(
    [income({ amount: 2000, frequency: 'monthly' })],
    [
      debt({
        id: 10,
        name: 'Actual Only',
        current_balance: 1000,
        minimum_monthly_payment: 0,
        actual_monthly_payment: 500,
        planned_extra_payment: 0,
      }),
      debt({
        id: 11,
        name: 'Minimum Only',
        current_balance: 1000,
        minimum_monthly_payment: 300,
        actual_monthly_payment: 0,
        planned_extra_payment: 0,
        priority_number: 2,
      }),
    ],
    [
      rate({ id: 10, debt_id: 10, apr_percentage: 0 }),
      rate({ id: 11, debt_id: 11, apr_percentage: 0 }),
    ],
    '2026-01-01',
    1,
  );

  assert.equal(result.generated_rows[0]['Total Debt Payments'], 800);
});

test('native baseline projection keeps same-name debts without ids in separate balance columns', () => {
  const result = baseline.generateBaselineProjection(
    [],
    [
      debt({
        id: undefined,
        name: 'Duplicate',
        current_balance: 500,
        minimum_monthly_payment: 100,
        actual_monthly_payment: 100,
      }),
      debt({
        id: undefined,
        name: 'Duplicate',
        current_balance: 800,
        minimum_monthly_payment: 100,
        actual_monthly_payment: 100,
      }),
    ],
    [],
    '2026-01-01',
    1,
    null,
    [],
    false,
  );

  const [row] = result.generated_rows;
  assert.equal(row['Duplicate (Credit Card - $100/mo)'], 400);
  assert.equal(row['Duplicate (Credit Card - $100/mo) #2'], 700);
  assert.equal(row['Duplicate (Credit Card - $100/mo) Payment'], 100);
  assert.equal(row['Duplicate (Credit Card - $100/mo) #2 Payment'], 100);
  assert.equal(row['Total Debt Payments'], 200);
  assert.equal(row['Total Debt'], 1100);
});

test('native baseline projection applies yearly Other debt only on anchored yearly dates', () => {
  const result = baseline.generateBaselineProjection(
    [income({ amount: 1000, start_date: '2026-03-01' })],
    [
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
    [],
    '2026-03-01',
    14,
    null,
    [account({ amount: 0 })],
    false,
  );

  const rowsByMonth = Object.fromEntries(result.generated_rows.map((row) => [row.month, row]));
  assert.equal(rowsByMonth['2026-03-01'].Bills, 120);
  assert.equal(rowsByMonth['2026-04-01'].Bills, 0);
  assert.equal(rowsByMonth['2027-02-01'].Bills, 0);
  assert.equal(rowsByMonth['2027-03-01'].Bills, 120);
  assert.equal(rowsByMonth['2027-04-01'].Bills, 0);
});

test('native baseline projection applies leap-day yearly Other debt on Feb 28 in non-leap years', () => {
  const result = baseline.generateBaselineProjection(
    [income({ amount: 1000, start_date: '2028-02-01' })],
    [
      debt({
        id: 2,
        name: 'Leap Fee',
        debt_type: 'other',
        current_balance: 0,
        minimum_monthly_payment: 75,
        actual_monthly_payment: 75,
        recurrence: 'yearly',
        start_date: '2028-02-29',
        payoff_target_date: '2032-02-29',
        priority_number: null,
      }),
    ],
    [],
    '2028-02-01',
    50,
    null,
    [account({ amount: 0 })],
    false,
  );

  const rowsByMonth = Object.fromEntries(result.generated_rows.map((row) => [row.month, row]));
  assert.equal(rowsByMonth['2028-02-01'].Bills, 75);
  assert.equal(rowsByMonth['2029-02-01'].Bills, 75);
  assert.equal(rowsByMonth['2030-02-01'].Bills, 75);
  assert.equal(rowsByMonth['2031-02-01'].Bills, 75);
  assert.equal(rowsByMonth['2032-02-01'].Bills, 75);
});

test('native baseline projection matches FastAPI for account transfers and owner cash rows', () => {
  const cases = [
    {
      start_month: '2026-01-01',
      months: 4,
      income_sources: [
        income({ id: 1, account_balance_id: 1, amount: 2000, frequency: 'monthly' }),
        transfer({ id: 2, amount: 200, frequency: 'monthly', from_account_id: 1, to_account_id: 2 }),
        transfer({ id: 3, amount: 100, frequency: 'first_and_fifteenth', from_account_id: 2, to_account_id: 1, start_date: '2026-02-01', end_date: '2026-03-14' }),
      ],
      debts: [
        debt({ id: 1, account_balance_id: 1, name: 'Loan', debt_type: 'vehicle_loan', current_balance: 900, minimum_monthly_payment: 300, actual_monthly_payment: 300 }),
        debt({ id: 2, account_balance_id: 2, name: 'Rent', debt_type: 'other', current_balance: 0, minimum_monthly_payment: 700, actual_monthly_payment: 700, recurrence: 'monthly' }),
      ],
      interest_rates: [
        rate({ id: 1, debt_id: 1, apr_percentage: 6, start_date: '2026-01-01' }),
      ],
      account_balances: [
        account({ id: 1, name: 'Alex Checking', owner: 'Alex', amount: 1000 }),
        account({ id: 2, name: 'Joint Checking', owner: 'Joint', amount: 2000 }),
      ],
    },
  ];

  assertParity(cases);
});

test('native baseline projection matches FastAPI disabled extended payoff mode', () => {
  const cases = [
    {
      start_month: '2026-01-01',
      months: 3,
      include_extended_payoff: false,
      income_sources: [income({ id: 1, amount: 100 })],
      debts: [
        debt({ id: 1, current_balance: 5000, minimum_monthly_payment: 50, actual_monthly_payment: 50 }),
      ],
      interest_rates: [
        rate({ id: 1, debt_id: 1, apr_percentage: 29.99, start_date: '2026-01-01' }),
      ],
      account_balances: [],
    },
  ];

  assertParity(cases);
});

test('baseline engine adapter normalizes Mongo documents into calculation payloads', () => {
  assert.deepEqual(
    baselineAdapter.normalizedAccount({
      _id: 'account-object',
      legacyId: 10,
      name: 'Checking',
      owner: 'Alex',
      account_type: 'Checking',
      amount: 100,
      date: '2026-01-15',
      active: true,
    }),
    {
      id: 10,
      name: 'Checking',
      owner: 'Alex',
      account_type: 'Checking',
      amount: 100,
      date: '2026-01-15',
      notes: null,
      active: true,
    },
  );

  assert.deepEqual(
    baselineAdapter.normalizedIncome({
      _id: 'income-object',
      legacyId: 20,
      legacy_account_balance_id: 10,
      legacy_from_account_id: 11,
      legacy_to_account_id: 12,
      is_account_transfer: true,
      label: 'Transfer',
      amount: 50,
      start_date: '2026-01-01',
      frequency: 'monthly',
    }),
    {
      id: 20,
      account_balance_id: 10,
      is_account_transfer: true,
      from_account_id: 11,
      to_account_id: 12,
      label: 'Transfer',
      amount: 50,
      start_date: '2026-01-01',
      end_date: null,
      frequency: 'monthly',
      notes: null,
      active: true,
    },
  );

  assert.deepEqual(
    baselineAdapter.normalizedDebt({
      _id: 'debt-object',
      legacyId: 30,
      legacy_account_balance_id: 10,
      name: 'Card',
      debt_type: 'credit_card',
      starting_balance: 1000,
      current_balance: 900,
      minimum_monthly_payment: 100,
      planned_extra_payment: 25,
      start_date: '2026-01-01',
      active: true,
    }),
    {
      id: 30,
      account_balance_id: 10,
      name: 'Card',
      debt_type: 'credit_card',
      starting_balance: 1000,
      current_balance: 900,
      minimum_monthly_payment: 100,
      planned_extra_payment: 25,
      recurrence: null,
      payment_due_day: null,
      payment_date: null,
      start_date: '2026-01-01',
      payoff_target_date: null,
      target_payoff_active: false,
      priority_number: null,
      active: true,
      notes: null,
    },
  );

  assert.deepEqual(
    baselineAdapter.normalizedInterestRate({
      _id: 'rate-object',
      legacyId: 40,
      legacy_debt_id: 30,
      apr_percentage: 12,
      start_date: '2026-01-01',
    }),
    {
      id: 40,
      debt_id: 30,
      apr_percentage: 12,
      start_date: '2026-01-01',
      end_date: null,
      notes: null,
    },
  );
});

test('target payoff active pays normal payments until target month then applies lump sum', () => {
  const result = nodeResult({
    start_month: '2026-01-01',
    months: 4,
    income_sources: [income({ amount: 2000 })],
    debts: [
      debt({
        current_balance: 1000,
        minimum_monthly_payment: 100,
        planned_extra_payment: 0,
        payoff_target_date: '2026-04-01',
        target_payoff_active: true,
      }),
    ],
    interest_rates: [rate({ apr_percentage: 0 })],
    account_balances: [account({ amount: 0 })],
  });

  assert.equal(result.generated_rows[0]['Card Payment'], 100);
  assert.equal(result.generated_rows[0].Card, 900);
  assert.equal(result.generated_rows[1]['Card Payment'], 100);
  assert.equal(result.generated_rows[1].Card, 800);
  assert.equal(result.generated_rows[2]['Card Payment'], 100);
  assert.equal(result.generated_rows[2].Card, 700);
  assert.equal(result.generated_rows[3]['Card Payment'], 700);
  assert.equal(result.generated_rows[3].Card, 0);
  assert.equal(result.generated_rows[3]['Monthly Surplus'], 1300);
  assert.equal(result.generated_rows[3]['Cash Balance'], 7000);
  assert.equal(result.account_projection_rows[0].accounts[0].debt_payments, 100);
  assert.equal(result.account_projection_rows[1].accounts[0].debt_payments, 100);
  assert.equal(result.account_projection_rows[2].accounts[0].debt_payments, 100);
  assert.equal(result.account_projection_rows[3].accounts[0].debt_payments, 700);
  assert.equal(result.account_projection_rows[3].accounts[0].cash_balance, 7000);
  assert.deepEqual(result.generated_rows[3]['Debts Paid Off'], ['Card']);
  assert.equal(result.summary.projected_payoff_date, '2026-04-01');
  assert.equal(result.summary.months_to_debt_free, 4);
});

test('target payoff does not redistribute screenshot-scale baseline payments before target month', () => {
  const result = nodeResult({
    start_month: '2026-06-01',
    months: 8,
    income_sources: [income({ start_date: '2026-06-01', amount: 12000 })],
    debts: [
      debt({
        id: 1,
        name: 'Travel Rewards Card',
        start_date: '2026-01-01',
        current_balance: 15000,
        minimum_monthly_payment: 125,
        planned_extra_payment: 175,
        payoff_target_date: '2027-01-15',
        target_payoff_active: true,
      }),
    ],
    interest_rates: [rate({ debt_id: 1, start_date: '2026-01-01', apr_percentage: 12 })],
    account_balances: [account({ amount: 0, date: '2026-06-01' })],
  });

  for (const row of result.generated_rows.slice(0, 7)) {
    assert.equal(row['Travel Rewards Card Payment'], 300);
    assert.notEqual(row['Travel Rewards Card Payment'], 1960.36);
  }
  assert.equal(result.generated_rows[7]['Travel Rewards Card Payment'] > 300, true);
  assert.equal(result.generated_rows[7]['Travel Rewards Card'], 0);
  assert.deepEqual(result.generated_rows[7]['Debts Paid Off'], ['Travel Rewards Card']);
});

test('target payoff allows cash balance to go negative for target month lump sum', () => {
  const result = nodeResult({
    start_month: '2026-01-01',
    months: 4,
    income_sources: [income({ amount: 0 })],
    debts: [
      debt({
        current_balance: 1000,
        minimum_monthly_payment: 100,
        planned_extra_payment: 0,
        payoff_target_date: '2026-04-01',
        target_payoff_active: true,
      }),
    ],
    interest_rates: [rate({ apr_percentage: 0 })],
    account_balances: [account({ amount: 0 })],
  });

  assert.equal(result.generated_rows[0]['Cash Balance'], -100);
  assert.equal(result.generated_rows[1]['Cash Balance'], -200);
  assert.equal(result.generated_rows[2]['Cash Balance'], -300);
  assert.equal(result.generated_rows[3]['Card Payment'], 700);
  assert.equal(result.generated_rows[3].Card, 0);
  assert.equal(result.generated_rows[3]['Monthly Surplus'], -700);
  assert.equal(result.generated_rows[3]['Cash Balance'], -1000);
  assert.equal(result.account_projection_rows[3].accounts[0].debt_payments, 700);
  assert.equal(result.account_projection_rows[3].accounts[0].cash_balance, -1000);
  assert.deepEqual(result.generated_rows[3]['Debts Paid Off'], ['Card']);
});

test('target payoff does not create a lump sum when natural payoff occurs first', () => {
  const result = nodeResult({
    start_month: '2026-01-01',
    months: 6,
    income_sources: [income({ amount: 2000 })],
    debts: [
      debt({
        current_balance: 200,
        minimum_monthly_payment: 100,
        planned_extra_payment: 0,
        payoff_target_date: '2026-06-01',
        target_payoff_active: true,
      }),
    ],
    interest_rates: [rate({ apr_percentage: 0 })],
    account_balances: [account({ amount: 0 })],
  });

  assert.equal(result.generated_rows[0]['Card Payment'], 100);
  assert.equal(result.generated_rows[1]['Card Payment'], 100);
  assert.equal(result.generated_rows[1].Card, 0);
  assert.deepEqual(result.generated_rows[1]['Debts Paid Off'], ['Card']);
  assert.equal(result.generated_rows[5]['Card Payment'], 0);
  assert.equal(result.generated_rows[5].Card, 0);
  assert.equal(result.summary.projected_payoff_date, '2026-02-01');
  assert.equal(result.summary.months_to_debt_free, 2);
});

test('target payoff date must be after the projection start month', () => {
  assert.throws(
    () => nodeResult({
      start_month: '2026-01-01',
      months: 4,
      income_sources: [income({ amount: 2000 })],
      debts: [
        debt({
          current_balance: 1000,
          minimum_monthly_payment: 100,
          payoff_target_date: '2026-01-01',
          target_payoff_active: true,
        }),
      ],
      interest_rates: [rate({ apr_percentage: 0 })],
      account_balances: [account({ amount: 0 })],
    }),
    /Target Payoff Date must be after the projection start month/,
  );
});

test('baseline engine adapter validates projection request defaults and ranges', () => {
  assert.deepEqual(
    baselineAdapter.validatedProjectionPayload({
      start_month: '2026-01-20',
      end_month: '2026-03-31',
      account_balance_ids: [1],
      income_source_ids: [2],
      debt_ids: [3],
    }),
    {
      startMonth: '2026-01-01',
      months: null,
      endMonth: '2026-03-01',
      accountBalanceIds: [1],
      incomeSourceIds: [2],
      debtIds: [3],
    },
  );

  assert.throws(
    () => baselineAdapter.validatedProjectionPayload({ start_month: '2026-01-01', months: 301 }),
    /months must be between 1 and 300/,
  );
});
