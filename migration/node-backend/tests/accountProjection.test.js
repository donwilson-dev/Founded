const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const accounts = require('../src/services/calculations/accountProjection');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import json
import sys

from app.services.calculations import (
    _account_key,
    _empty_account_activity,
    generate_account_projection_rows,
    starting_cash_balance,
    transfer_amount_for_month,
)
from datetime import date

def parse_month(value):
    return date.fromisoformat(value)

def owner_cash_totals(account_projection_row):
    totals = {}
    for account in account_projection_row.get("accounts", []):
        owner = account.get("owner")
        key = "Unassigned" if owner is None else str(owner)
        totals[key] = round(totals.get(key, 0) + float(account.get("cash_balance") or 0), 2)
    return totals

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    op = case["op"]
    if op == "account_key":
        results.append(_account_key(case.get("value")))
    elif op == "starting_cash_balance":
        results.append(starting_cash_balance(case.get("account_balances"), parse_month(case["start_month"])))
    elif op == "transfer_amount_for_month":
        results.append(transfer_amount_for_month(case["source"], parse_month(case["month"])))
    elif op == "empty_account_activity":
        results.append(_empty_account_activity())
    elif op == "generate_account_projection_rows":
        results.append(
            generate_account_projection_rows(
                case.get("income_sources", []),
                case.get("debts", []),
                case.get("projection_rows", []),
                case.get("account_balances", []),
            )
        )
    elif op == "owner_cash_totals":
        rows = generate_account_projection_rows(
            case.get("income_sources", []),
            case.get("debts", []),
            case.get("projection_rows", []),
            case.get("account_balances", []),
        )
        results.append(owner_cash_totals(rows[case.get("row_index", 0)]))
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
    case 'account_key':
      return accounts.accountKey(caseData.value);
    case 'starting_cash_balance':
      return accounts.startingCashBalance(caseData.account_balances, caseData.start_month);
    case 'transfer_amount_for_month':
      return accounts.transferAmountForMonth(caseData.source, caseData.month);
    case 'empty_account_activity':
      return accounts.emptyAccountActivity();
    case 'generate_account_projection_rows':
      return accounts.generateAccountProjectionRows(
        caseData.income_sources ?? [],
        caseData.debts ?? [],
        caseData.projection_rows ?? [],
        caseData.account_balances ?? [],
      );
    case 'owner_cash_totals': {
      const rows = accounts.generateAccountProjectionRows(
        caseData.income_sources ?? [],
        caseData.debts ?? [],
        caseData.projection_rows ?? [],
        caseData.account_balances ?? [],
      );
      return accounts.ownerCashTotals(rows[caseData.row_index ?? 0]);
    }
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
    current_balance: 300,
    minimum_monthly_payment: 100,
    start_date: '2026-01-01',
    active: true,
    ...overrides,
  };
}

test('account key, starting cash, empty activity, and transfer amount helpers match FastAPI', () => {
  const cases = [
    { op: 'account_key', value: null },
    { op: 'account_key', value: '' },
    { op: 'account_key', value: '12' },
    { op: 'account_key', value: '0012' },
    { op: 'account_key', value: '12.5' },
    { op: 'account_key', value: 'external-id' },
    { op: 'account_key', value: 7.9 },
    { op: 'account_key', value: true },
    { op: 'empty_account_activity' },
    {
      op: 'starting_cash_balance',
      start_month: '2026-01-01',
      account_balances: [
        account({ id: 1, amount: 1000, date: '2025-12-15' }),
        account({ id: 2, amount: 0, date: '2026-01-01' }),
        account({ id: 3, amount: -50, date: '2025-12-01' }),
        account({ id: 4, amount: 250, date: '2026-02-01' }),
        account({ id: 5, amount: 999, date: '2025-12-01', active: false }),
      ],
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-01-01',
      source: transfer({ is_account_transfer: false }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-01-01',
      source: transfer({ amount: 100, frequency: 'monthly' }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-01-01',
      source: transfer({ amount: 100, frequency: 'weekly', start_date: '2026-01-01' }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-02-01',
      source: transfer({ amount: 100, frequency: 'bi_weekly', start_date: '2026-01-01' }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-07-01',
      source: transfer({ amount: 100, frequency: 'first_and_fifteenth', start_date: '2026-07-02', end_date: '2026-07-14' }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-12-01',
      source: transfer({ amount: 100, frequency: 'one_time', start_date: '2026-12-10' }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2027-01-01',
      source: transfer({ amount: 100, frequency: 'one_time', start_date: '2026-12-10' }),
    },
    {
      op: 'transfer_amount_for_month',
      month: '2026-01-01',
      source: transfer({ amount: 100, frequency: 'monthly', active: false }),
    },
  ];

  assertParity(cases);
});

test('account projection rows match FastAPI for income, debts, bills, and household-neutral transfers', () => {
  const cases = [
    {
      op: 'generate_account_projection_rows',
      account_balances: [
        account({ id: 1, name: 'Alex Checking', owner: 'Alex', amount: 1000 }),
        account({ id: 2, name: 'Joint Checking', owner: 'Joint', amount: 500 }),
      ],
      income_sources: [
        income({ id: 1, account_balance_id: 1, amount: 1000 }),
        transfer({ id: 2, amount: 200, frequency: 'monthly', from_account_id: 1, to_account_id: 2 }),
      ],
      debts: [
        debt({ id: 1, account_balance_id: 1, name: 'Card', debt_type: 'credit_card' }),
        debt({ id: 2, account_balance_id: 2, name: 'Utility', debt_type: 'other' }),
      ],
      projection_rows: [
        {
          month: '2026-01-01',
          'Card Payment': 100,
          'Utility Bill': 50,
          'Monthly Surplus': 850,
          'Cash Balance': 2350,
        },
        {
          month: '2026-02-01',
          'Card Payment': 100,
          'Utility Bill': 50,
          'Monthly Surplus': 850,
          'Cash Balance': 3200,
        },
      ],
    },
  ];

  assertParity(cases);
});

test('account projection transfer recurrence and owner rollups match FastAPI', () => {
  const recurringTransferCase = {
    account_balances: [
      account({ id: 1, name: 'Alex Checking', owner: 'Alex', amount: 1000 }),
      account({ id: 2, name: 'Joint Checking', owner: 'Joint', amount: 0 }),
    ],
    income_sources: [
      transfer({ id: 1, amount: 100, frequency: 'weekly', start_date: '2026-01-01', from_account_id: 1, to_account_id: 2 }),
    ],
    debts: [],
    projection_rows: [
      { month: '2026-01-01', 'Monthly Surplus': 0, 'Cash Balance': 1000 },
      { month: '2026-02-01', 'Monthly Surplus': 0, 'Cash Balance': 1000 },
    ],
  };

  const sameOwnerCase = {
    account_balances: [
      account({ id: 1, name: 'Alex Checking', owner: 'Alex', amount: 1000 }),
      account({ id: 2, name: 'Alex Savings', owner: 'Alex', account_type: 'Savings', amount: 100 }),
    ],
    income_sources: [
      transfer({ id: 1, amount: 250, frequency: 'monthly', from_account_id: 1, to_account_id: 2 }),
    ],
    debts: [],
    projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0, 'Cash Balance': 1100 }],
  };

  const cases = [
    { op: 'generate_account_projection_rows', ...recurringTransferCase },
    { op: 'owner_cash_totals', ...recurringTransferCase, row_index: 0 },
    { op: 'owner_cash_totals', ...recurringTransferCase, row_index: 1 },
    { op: 'generate_account_projection_rows', ...sameOwnerCase },
    { op: 'owner_cash_totals', ...sameOwnerCase, row_index: 0 },
  ];

  assertParity(cases);
});

test('account projection compatibility fallbacks match FastAPI for unassigned, missing, inactive, future, and same-account cases', () => {
  const cases = [
    {
      op: 'generate_account_projection_rows',
      account_balances: [
        account({ id: 1, name: 'Future Account', owner: 'Future', amount: 999, date: '2026-03-01' }),
        account({ id: 2, name: 'Inactive Account', owner: 'Inactive', amount: 500, active: false }),
      ],
      income_sources: [
        income({ id: 1, account_balance_id: null, label: 'Unassigned Income', amount: 100 }),
        transfer({ id: 2, amount: 50, from_account_id: 99, to_account_id: null, active: false }),
      ],
      debts: [
        debt({ id: 1, account_balance_id: 42, name: 'Missing Debt Account', debt_type: 'credit_card' }),
        debt({ id: 2, account_balance_id: null, name: 'Missing Bill Account', debt_type: 'other' }),
        debt({ id: 3, account_balance_id: 1, name: 'Inactive Debt', debt_type: 'credit_card', active: false }),
      ],
      projection_rows: [
        {
          month: '2026-01-01',
          'Missing Debt Account Payment': 10,
          'Missing Bill Account Bill': 15,
          'Inactive Debt Payment': 999,
          'Monthly Surplus': 75,
          'Cash Balance': 75,
        },
      ],
    },
    {
      op: 'generate_account_projection_rows',
      account_balances: [account({ id: 1, amount: 1000 })],
      income_sources: [transfer({ id: 1, amount: 125, from_account_id: 1, to_account_id: 1 })],
      debts: [],
      projection_rows: [{ month: '2026-01-01', 'Monthly Surplus': 0, 'Cash Balance': 1000 }],
    },
  ];

  assertParity(cases);
});

test('account projection prevents transfers from overdrawing source accounts', () => {
  const rows = accounts.generateAccountProjectionRows(
    [
      transfer({ id: 1, amount: 75, frequency: 'monthly', from_account_id: 1, to_account_id: 2 }),
      transfer({ id: 2, amount: 100, frequency: 'monthly', from_account_id: 3, to_account_id: 2 }),
      transfer({ id: 3, amount: 150, frequency: 'monthly', from_account_id: 4, to_account_id: 2 }),
      transfer({ id: 4, amount: 100, frequency: 'weekly', from_account_id: 5, to_account_id: 2, start_date: '2026-01-01' }),
    ],
    [],
    [
      { month: '2026-01-01', 'Monthly Surplus': 0, 'Cash Balance': 825 },
      { month: '2026-02-01', 'Monthly Surplus': 0, 'Cash Balance': 825 },
    ],
    [
      account({ id: 1, amount: 100, name: 'Funded Checking' }),
      account({ id: 2, amount: 0, name: 'Joint Checking' }),
      account({ id: 3, amount: 100, name: 'Exact Checking' }),
      account({ id: 4, amount: 100, name: 'Short Checking' }),
      account({ id: 5, amount: 250, name: 'Weekly Checking' }),
    ],
  );

  const janAccounts = new Map(rows[0].accounts.map((item) => [item.account_balance_id, item]));
  assert.equal(janAccounts.get(1).transfers_out, 75);
  assert.equal(janAccounts.get(1).cash_balance, 25);
  assert.equal(janAccounts.get(3).transfers_out, 100);
  assert.equal(janAccounts.get(3).cash_balance, 0);
  assert.equal(janAccounts.get(4).transfers_out, 0);
  assert.equal(janAccounts.get(4).cash_balance, 100);
  assert.equal(janAccounts.get(5).transfers_out, 200);
  assert.equal(janAccounts.get(5).cash_balance, 50);
  assert.equal(janAccounts.get(2).transfers_in, 375);
  assert.equal(janAccounts.get(2).cash_balance, 375);

  const febAccounts = new Map(rows[1].accounts.map((item) => [item.account_balance_id, item]));
  assert.equal(febAccounts.get(1).transfers_out, 0);
  assert.equal(febAccounts.get(3).transfers_out, 0);
  assert.equal(febAccounts.get(4).transfers_out, 0);
  assert.equal(febAccounts.get(5).transfers_out, 0);
  assert.equal(febAccounts.get(1).cash_balance, 25);
  assert.equal(febAccounts.get(3).cash_balance, 0);
  assert.equal(febAccounts.get(4).cash_balance, 100);
  assert.equal(febAccounts.get(5).cash_balance, 50);
  assert.equal(febAccounts.get(2).cash_balance, 375);
});

test('account projection protects source accounts after same-month income, debts, and bills', () => {
  const rows = accounts.generateAccountProjectionRows(
    [
      income({ id: 1, account_balance_id: 1, amount: 25, frequency: 'monthly' }),
      transfer({ id: 2, amount: 50, frequency: 'monthly', from_account_id: 1, to_account_id: 2 }),
    ],
    [
      debt({ id: 1, account_balance_id: 1, name: 'Card', debt_type: 'credit_card' }),
      debt({ id: 2, account_balance_id: 1, name: 'Utility', debt_type: 'other' }),
    ],
    [
      {
        month: '2026-01-01',
        'Card Payment': 80,
        'Utility Bill': 20,
        'Monthly Surplus': -75,
        'Cash Balance': 25,
      },
    ],
    [
      account({ id: 1, amount: 100, name: 'Source Checking' }),
      account({ id: 2, amount: 0, name: 'Destination Checking' }),
    ],
  );

  const janAccounts = new Map(rows[0].accounts.map((item) => [item.account_balance_id, item]));
  assert.equal(janAccounts.get(1).income, 25);
  assert.equal(janAccounts.get(1).debt_payments, 80);
  assert.equal(janAccounts.get(1).bills, 20);
  assert.equal(janAccounts.get(1).transfers_out, 0);
  assert.equal(janAccounts.get(1).cash_balance, 25);
  assert.equal(janAccounts.get(2).transfers_in, 0);
  assert.equal(rows[0].total_cash_balance, 25);
});
