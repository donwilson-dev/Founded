const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const primitives = require('../src/services/calculations/primitives');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import json
import sys

from app.services.calculations import (
    _account_label,
    applicable_apr,
    base_actual_payment,
    debt_apr,
    debt_column_labels,
    debt_payment_active_for_month,
    debt_type_label,
    is_bill,
    is_true_debt,
    monthly_income_amount,
    monthly_interest,
    payment_label,
    scheduled_actual_payment,
)
from datetime import date

def parse_month(value):
    return date.fromisoformat(value)

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    op = case["op"]
    if op == "applicable_apr":
        results.append(applicable_apr(case["debt_id"], case.get("rates", []), parse_month(case["month"])))
    elif op == "debt_apr":
        results.append(debt_apr(case["debt"], case.get("rates", []), parse_month(case["month"])))
    elif op == "is_bill":
        results.append(is_bill(case["debt"]))
    elif op == "is_true_debt":
        results.append(is_true_debt(case["debt"]))
    elif op == "monthly_income_amount":
        results.append(monthly_income_amount(case["source"], parse_month(case["month"])))
    elif op == "base_actual_payment":
        results.append(base_actual_payment(case["debt"]))
    elif op == "debt_type_label":
        results.append(debt_type_label(case.get("value")))
    elif op == "payment_label":
        results.append(payment_label(case.get("amount")))
    elif op == "debt_column_labels":
        results.append(debt_column_labels(case["debts"]))
    elif op == "scheduled_actual_payment":
        month = parse_month(case["month"]) if case.get("month") else None
        results.append(scheduled_actual_payment(case["debt"], month))
    elif op == "debt_payment_active_for_month":
        results.append(debt_payment_active_for_month(case["debt"], parse_month(case["month"])))
    elif op == "monthly_interest":
        results.append(monthly_interest(case["balance"], case["apr_percentage"]))
    elif op == "account_label":
        results.append(_account_label(case["account"]))
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
    case 'applicable_apr':
      return primitives.applicableApr(caseData.debt_id, caseData.rates ?? [], caseData.month);
    case 'debt_apr':
      return primitives.debtApr(caseData.debt, caseData.rates ?? [], caseData.month);
    case 'is_bill':
      return primitives.isBill(caseData.debt);
    case 'is_true_debt':
      return primitives.isTrueDebt(caseData.debt);
    case 'monthly_income_amount':
      return primitives.monthlyIncomeAmount(caseData.source, caseData.month);
    case 'base_actual_payment':
      return primitives.baseActualPayment(caseData.debt);
    case 'debt_type_label':
      return primitives.debtTypeLabel(caseData.value);
    case 'payment_label':
      return primitives.paymentLabel(caseData.amount);
    case 'debt_column_labels':
      return primitives.debtColumnLabels(caseData.debts);
    case 'scheduled_actual_payment':
      return primitives.scheduledActualPayment(caseData.debt, caseData.month);
    case 'debt_payment_active_for_month':
      return primitives.debtPaymentActiveForMonth(caseData.debt, caseData.month);
    case 'monthly_interest':
      return primitives.monthlyInterest(caseData.balance, caseData.apr_percentage);
    case 'account_label':
      return primitives.accountLabel(caseData.account);
    default:
      throw new Error(`Unsupported operation: ${caseData.op}`);
  }
}

function assertParity(cases) {
  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
}

test('APR primitives match FastAPI standard, promo, expired, missing, and other-debt behavior', () => {
  const rates = [
    { debt_id: 1, apr_percentage: 18, start_date: '2026-01-01', end_date: null },
    { debt_id: 1, apr_percentage: 0.99, start_date: '2026-01-01', end_date: '2026-03-31' },
    { debt_id: 1, apr_percentage: 24, start_date: '2026-06-01', end_date: null },
    { debt_id: 2, apr_percentage: 0, start_date: '2026-01-01', end_date: null },
    { debt_id: 3, apr_percentage: 7.5, start_date: '2026-02-01', end_date: '2026-02-28' },
  ];
  const cases = [
    { op: 'applicable_apr', debt_id: 1, rates, month: '2025-12-01' },
    { op: 'applicable_apr', debt_id: 1, rates, month: '2026-02-01' },
    { op: 'applicable_apr', debt_id: 1, rates, month: '2026-04-01' },
    { op: 'applicable_apr', debt_id: 1, rates, month: '2026-06-01' },
    { op: 'applicable_apr', debt_id: 2, rates, month: '2026-06-01' },
    { op: 'applicable_apr', debt_id: 999, rates, month: '2026-06-01' },
    { op: 'debt_apr', debt: { id: 1, debt_type: 'credit_card' }, rates, month: '2026-02-01' },
    { op: 'debt_apr', debt: { id: 1, debt_type: 'other' }, rates, month: '2026-02-01' },
    { op: 'debt_apr', debt: { id: 3, debt_type: 'vehicle_loan' }, rates, month: '2026-03-01' },
  ];

  assertParity(cases);
});

test('debt categorization and payment primitives match FastAPI outputs', () => {
  const baseDebt = {
    id: 1,
    debt_type: 'credit_card',
    minimum_monthly_payment: 100,
    planned_extra_payment: 25,
    start_date: '2026-05-01',
    active: true,
  };
  const otherDebt = {
    id: 2,
    debt_type: 'other',
    minimum_monthly_payment: 100,
    actual_monthly_payment: 250,
    planned_extra_payment: 0,
    recurrence: 'weekly',
    start_date: '2026-05-01',
    payoff_target_date: '2026-05-31',
    active: true,
  };
  const cases = [
    { op: 'is_bill', debt: baseDebt },
    { op: 'is_bill', debt: otherDebt },
    { op: 'is_true_debt', debt: baseDebt },
    { op: 'is_true_debt', debt: otherDebt },
    { op: 'base_actual_payment', debt: baseDebt },
    { op: 'base_actual_payment', debt: { ...baseDebt, actual_monthly_payment: 300 } },
    { op: 'base_actual_payment', debt: { ...baseDebt, actual_monthly_payment: 50 } },
    { op: 'base_actual_payment', debt: { ...baseDebt, planned_extra_payment: null } },
    { op: 'scheduled_actual_payment', debt: baseDebt },
    { op: 'scheduled_actual_payment', debt: otherDebt },
    { op: 'scheduled_actual_payment', debt: otherDebt, month: '2026-05-01' },
    { op: 'scheduled_actual_payment', debt: otherDebt, month: '2026-06-01' },
    { op: 'debt_payment_active_for_month', debt: baseDebt, month: '2026-04-01' },
    { op: 'debt_payment_active_for_month', debt: baseDebt, month: '2026-05-01' },
    { op: 'debt_payment_active_for_month', debt: { ...baseDebt, active: false }, month: '2026-05-01' },
    { op: 'debt_payment_active_for_month', debt: otherDebt, month: '2026-05-01' },
    { op: 'debt_payment_active_for_month', debt: otherDebt, month: '2026-06-01' },
  ];

  assertParity(cases);
});

test('income primitives match FastAPI recurrence and transfer behavior', () => {
  const cases = [
    {
      op: 'monthly_income_amount',
      source: { amount: 1000, start_date: '2026-05-01', end_date: null, frequency: 'monthly', active: true },
      month: '2026-05-01',
    },
    {
      op: 'monthly_income_amount',
      source: { amount: 1000, start_date: '2026-05-01', end_date: null, frequency: 'weekly', active: true },
      month: '2026-05-01',
    },
    {
      op: 'monthly_income_amount',
      source: { amount: 1000, start_date: '2026-05-01', end_date: null, frequency: 'bi_weekly', active: true },
      month: '2026-06-01',
    },
    {
      op: 'monthly_income_amount',
      source: { amount: 1000, start_date: '2026-05-01', end_date: null, frequency: 'one_time', active: true },
      month: '2026-06-01',
    },
    {
      op: 'monthly_income_amount',
      source: { amount: 1000, start_date: '2026-05-01', end_date: null, frequency: 'first_and_fifteenth', active: false },
      month: '2026-05-01',
    },
    {
      op: 'monthly_income_amount',
      source: { amount: 750, start_date: '2026-05-01', end_date: null, frequency: 'weekly', is_account_transfer: true, active: true },
      month: '2026-05-01',
    },
  ];

  assertParity(cases);
});

test('interest and label primitives match FastAPI compatibility behavior', () => {
  const cases = [
    { op: 'monthly_interest', balance: 1000, apr_percentage: 12 },
    { op: 'monthly_interest', balance: 3969, apr_percentage: 27.49 },
    { op: 'monthly_interest', balance: 1000, apr_percentage: 0 },
    { op: 'monthly_interest', balance: 0, apr_percentage: 29.99 },
    { op: 'debt_type_label', value: 'credit_card' },
    { op: 'debt_type_label', value: 'vehicle_loan' },
    { op: 'debt_type_label', value: 'student_loan' },
    { op: 'debt_type_label', value: 'balloon_debt' },
    { op: 'debt_type_label', value: null },
    { op: 'debt_type_label', value: '' },
    { op: 'payment_label', amount: 0 },
    { op: 'payment_label', amount: 140 },
    { op: 'payment_label', amount: 140.5 },
    { op: 'payment_label', amount: 1234 },
    { op: 'account_label', account: { name: 'USAA', account_type: 'Checking', owner: 'Don' } },
    { op: 'account_label', account: { name: 'NFCU', account_type: null, owner: null } },
    { op: 'account_label', account: { name: null, account_type: null, owner: null } },
  ];

  assertParity(cases);
});

test('debt column label disambiguation matches FastAPI outputs', () => {
  const duplicateDebts = [
    {
      id: 1,
      name: 'Citi',
      debt_type: 'credit_card',
      minimum_monthly_payment: 100,
      actual_monthly_payment: 140,
      planned_extra_payment: 0,
    },
    {
      id: 2,
      name: 'Citi',
      debt_type: 'personal_loan',
      minimum_monthly_payment: 250,
      planned_extra_payment: 0,
    },
    {
      id: 3,
      name: 'Citi',
      debt_type: 'credit_card',
      minimum_monthly_payment: 250,
      planned_extra_payment: 0,
    },
  ];
  const repeatedDebts = [
    {
      id: 4,
      name: 'Same',
      debt_type: 'credit_card',
      minimum_monthly_payment: 100,
      actual_monthly_payment: 100,
      planned_extra_payment: 0,
    },
    {
      id: 5,
      name: 'Same',
      debt_type: 'credit_card',
      minimum_monthly_payment: 100,
      actual_monthly_payment: 100,
      planned_extra_payment: 0,
    },
  ];
  const cases = [
    { op: 'debt_column_labels', debts: [{ id: 10, name: 'Mohela', debt_type: 'student_loan', minimum_monthly_payment: 250, planned_extra_payment: 0 }] },
    { op: 'debt_column_labels', debts: duplicateDebts },
    { op: 'debt_column_labels', debts: repeatedDebts },
    { op: 'debt_column_labels', debts: [{ id: 6, name: '', debt_type: 'unknown_type', minimum_monthly_payment: 0, planned_extra_payment: 0 }] },
  ];

  assertParity(cases);
});
