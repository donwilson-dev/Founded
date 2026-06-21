const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const helpers = require('../src/services/calculations/dateRecurrenceHelpers');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pythonExe = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');

const pythonParityScript = `
import json
import sys

from app.services.calculations import (
    add_months,
    first_of_month,
    inclusive_month_count,
    is_active_for_month,
    last_of_month,
    month_range,
    normalized_frequency,
    occurrence_count_for_month,
    parse_date,
)

cases = json.loads(sys.stdin.read())
results = []

for case in cases:
    op = case["op"]
    if op == "parse_date":
        results.append(parse_date(case["value"]).isoformat())
    elif op == "first_of_month":
        results.append(first_of_month(case["value"]).isoformat())
    elif op == "add_months":
        results.append(add_months(parse_date(case["value"]), case["months"]).isoformat())
    elif op == "last_of_month":
        results.append(last_of_month(case["value"]).isoformat())
    elif op == "inclusive_month_count":
        results.append(inclusive_month_count(case["start"], case["end"]))
    elif op == "month_range":
        results.append([
            item.isoformat()
            for item in month_range(case["start"], case.get("months"), case.get("end"))
        ])
    elif op == "normalized_frequency":
        results.append(normalized_frequency(case.get("value"), case.get("default", "monthly")))
    elif op == "occurrence_count_for_month":
        results.append(
            occurrence_count_for_month(
                case.get("frequency"),
                case["start_date"],
                case.get("end_date"),
                parse_date(case["month"]),
                active=case.get("active", True),
            )
        )
    elif op == "is_active_for_month":
        results.append(is_active_for_month(case["item"], parse_date(case["month"])))
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
    case 'parse_date':
      return helpers.formatDate(helpers.parseDate(caseData.value));
    case 'first_of_month':
      return helpers.formatDate(helpers.firstOfMonth(caseData.value));
    case 'add_months':
      return helpers.formatDate(helpers.addMonths(caseData.value, caseData.months));
    case 'last_of_month':
      return helpers.formatDate(helpers.lastOfMonth(caseData.value));
    case 'inclusive_month_count':
      return helpers.inclusiveMonthCount(caseData.start, caseData.end);
    case 'month_range':
      return helpers.monthRange(caseData.start, caseData.months, caseData.end).map(helpers.formatDate);
    case 'normalized_frequency':
      return helpers.normalizedFrequency(caseData.value, caseData.default ?? 'monthly');
    case 'occurrence_count_for_month':
      return helpers.occurrenceCountForMonth(
        caseData.frequency,
        caseData.start_date,
        caseData.end_date,
        caseData.month,
        { active: caseData.active ?? true },
      );
    case 'is_active_for_month':
      return helpers.isActiveForMonth(caseData.item, caseData.month);
    default:
      throw new Error(`Unsupported operation: ${caseData.op}`);
  }
}

test('date and month helpers match FastAPI outputs', () => {
  const cases = [
    { op: 'parse_date', value: '2026-06-08' },
    { op: 'first_of_month', value: '2026-06-08' },
    { op: 'first_of_month', value: '2024-02-29' },
    { op: 'add_months', value: '2026-12-31', months: 1 },
    { op: 'add_months', value: '2026-01-01', months: -1 },
    { op: 'last_of_month', value: '2024-02-10' },
    { op: 'last_of_month', value: '2023-02-10' },
    { op: 'last_of_month', value: '2026-04-01' },
    { op: 'last_of_month', value: '2026-05-31' },
    { op: 'inclusive_month_count', start: '2026-12-15', end: '2027-02-01' },
    { op: 'month_range', start: '2026-11-15', months: 4 },
    { op: 'month_range', start: '2026-06-01', months: 0 },
    { op: 'month_range', start: '2026-01-01', end: '2055-01-01' },
  ];

  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
});

test('frequency normalization matches FastAPI outputs for persisted values', () => {
  const cases = [
    { op: 'normalized_frequency', value: null },
    { op: 'normalized_frequency', value: '' },
    { op: 'normalized_frequency', value: 'weekly' },
    { op: 'normalized_frequency', value: null, default: 'one_time' },
  ];

  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
  assert.equal(helpers.normalizedFrequency({ value: 'bi_weekly' }), 'bi_weekly');
});

test('recurrence occurrence counts match FastAPI outputs', () => {
  const cases = [
    { op: 'occurrence_count_for_month', frequency: 'one_time', start_date: '2026-05-01', month: '2026-05-01' },
    { op: 'occurrence_count_for_month', frequency: 'one_time', start_date: '2026-05-01', month: '2026-06-01' },
    {
      op: 'occurrence_count_for_month',
      frequency: 'one_time',
      start_date: '2026-05-01',
      end_date: '2026-04-30',
      month: '2026-05-01',
    },
    { op: 'occurrence_count_for_month', frequency: 'monthly', start_date: '2026-05-31', month: '2026-05-01' },
    { op: 'occurrence_count_for_month', frequency: 'monthly', start_date: '2026-05-31', month: '2026-04-01' },
    { op: 'occurrence_count_for_month', frequency: 'monthly', start_date: '2026-05-01', end_date: '2026-06-30', month: '2026-07-01' },
    { op: 'occurrence_count_for_month', frequency: 'weekly', start_date: '2026-05-01', month: '2026-05-01' },
    { op: 'occurrence_count_for_month', frequency: 'weekly', start_date: '2026-05-01', month: '2026-06-01' },
    { op: 'occurrence_count_for_month', frequency: 'weekly', start_date: '2026-12-29', month: '2027-01-01' },
    { op: 'occurrence_count_for_month', frequency: 'bi_weekly', start_date: '2026-05-01', month: '2026-05-01' },
    { op: 'occurrence_count_for_month', frequency: 'bi_weekly', start_date: '2026-05-01', month: '2026-06-01' },
    { op: 'occurrence_count_for_month', frequency: 'weekly', start_date: '2024-02-01', month: '2024-02-01' },
    { op: 'occurrence_count_for_month', frequency: 'weekly', start_date: '2023-02-01', month: '2023-02-01' },
    { op: 'occurrence_count_for_month', frequency: 'first_and_fifteenth', start_date: '2026-07-01', month: '2026-07-01' },
    { op: 'occurrence_count_for_month', frequency: 'first_and_fifteenth', start_date: '2026-07-02', month: '2026-07-01' },
    { op: 'occurrence_count_for_month', frequency: 'first_and_fifteenth', start_date: '2026-07-16', month: '2026-07-01' },
    {
      op: 'occurrence_count_for_month',
      frequency: 'first_and_fifteenth',
      start_date: '2026-07-01',
      end_date: '2026-07-14',
      month: '2026-07-01',
    },
    { op: 'occurrence_count_for_month', frequency: 'unknown', start_date: '2026-05-01', month: '2026-05-01' },
    { op: 'occurrence_count_for_month', frequency: 'weekly', start_date: '2026-05-01', month: '2026-05-01', active: false },
  ];

  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
});

test('recurrence helpers preserve expected business edge cases', () => {
  assert.equal(helpers.occurrenceCountForMonth('one_time', '2026-05-01', null, '2026-05-01'), 1);
  assert.equal(helpers.occurrenceCountForMonth('one_time', '2026-05-01', null, '2026-06-01'), 0);
  assert.equal(helpers.occurrenceCountForMonth('weekly', '2026-05-01', null, '2026-05-01'), 5);
  assert.equal(helpers.occurrenceCountForMonth('weekly', '2026-05-01', null, '2026-06-01'), 4);
  assert.equal(helpers.occurrenceCountForMonth('bi_weekly', '2026-05-01', null, '2026-05-01'), 3);
  assert.equal(helpers.occurrenceCountForMonth('first_and_fifteenth', '2026-07-01', null, '2026-07-01'), 2);
  assert.equal(helpers.occurrenceCountForMonth('first_and_fifteenth', '2026-07-01', '2026-07-14', '2026-07-01'), 1);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2026-03-15', null, '2026-03-01'), 1);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2026-03-15', null, '2026-04-01'), 0);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2026-03-15', '2027-03-15', '2027-03-01'), 1);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2026-03-15', '2027-03-15', '2028-03-01'), 0);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2028-02-29', null, '2029-02-01'), 1);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2028-02-29', null, '2030-02-01'), 1);
  assert.equal(helpers.occurrenceCountForMonth('yearly', '2028-02-29', null, '2032-02-01'), 1);
  assert.equal(helpers.formatDate(helpers.yearlyOccurrenceDate('2028-02-29', 2029)), '2029-02-28');
  assert.equal(helpers.formatDate(helpers.yearlyOccurrenceDate('2028-02-29', 2032)), '2032-02-29');
  assert.equal(helpers.isYearlyEndDateAnchored('2026-03-15', '2028-03-15'), true);
  assert.equal(helpers.isYearlyEndDateAnchored('2026-03-15', '2028-04-15'), false);
  assert.equal(helpers.isYearlyEndDateAnchored('2026-03-15', '2028-03-20'), false);
  assert.equal(helpers.isYearlyEndDateAnchored('2028-02-29', '2029-02-28'), true);
  assert.equal(helpers.isYearlyEndDateAnchored('2028-02-29', '2032-02-29'), true);
});

test('active-month helper matches FastAPI output', () => {
  const cases = [
    {
      op: 'is_active_for_month',
      item: { frequency: 'monthly', start_date: '2026-05-15', end_date: null, active: true },
      month: '2026-05-01',
    },
    {
      op: 'is_active_for_month',
      item: { frequency: 'monthly', start_date: '2026-05-15', end_date: '2026-06-30', active: true },
      month: '2026-07-01',
    },
    {
      op: 'is_active_for_month',
      item: { frequency: 'weekly', start_date: '2026-05-01', payoff_target_date: '2026-05-14', active: true },
      month: '2026-05-01',
    },
    {
      op: 'is_active_for_month',
      item: { frequency: 'weekly', start_date: '2026-05-01', active: false },
      month: '2026-05-01',
    },
  ];

  assert.deepEqual(cases.map(nodeResult), pythonResults(cases));
});
