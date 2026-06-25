const BASE_COLUMNS = [
  'month',
  'Income',
  'Income+',
  'Total Debt Payments',
  'Total Debt Payments+',
  'Bills',
  'Bills+',
  'Total Interest Charged',
  'Total Debt',
  'Total Debt+',
  'Debts Paid Off',
  'Debts Paid Off+',
  'Monthly Surplus',
  'Monthly Surplus+',
  'Cash Balance',
  'Cash Balance+',
];

export const TABLE_COLUMN_VIEWS = {
  projectionOverview: {
    defaultColumns: [
      'month',
      'Income',
      'Total Debt Payments',
      'Bills',
      'Interest',
      'Principal',
      'Total Debt Balance',
      'Debts Paid Off',
      'Monthly Surplus',
      'Cash Balance',
    ],
  },
  scenarioComparison: {
    defaultColumns: [
      'month',
      'Income',
      'Income+',
      'Total Debt Payments',
      'Total Debt Payments+',
      'Bills',
      'Bills+',
      'Interest',
      'Interest+',
      'Principal',
      'Principal+',
      'Total Debt Balance',
      'Total Debt Balance+',
      'Debts Paid Off',
      'Debts Paid Off+',
      'Monthly Surplus',
      'Monthly Surplus+',
      'Cash Balance',
      'Cash Balance+',
    ],
  },
  accountProjection: {
    defaultColumns: [
      'month',
      'Income',
      'Total Debt Payments',
      'Bills',
      'Transfers Out',
      'Monthly Surplus',
      'Cash Balance',
    ],
  },
};

export function getColumns(rows = []) {
  const discovered = new Set(BASE_COLUMNS);
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => {
    if (key !== 'Starting Cash Balance') discovered.add(key);
  }));
  if (discovered.has('Total Debt Balance')) discovered.delete('Total Debt');
  if (discovered.has('Total Debt Balance+')) discovered.delete('Total Debt+');
  return [...discovered].filter((key) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, key)));
}

export function comparableCellValue(value) {
  if (Array.isArray(value)) {
    const normalized = value.map(comparableCellValue).filter((item) => item !== '');
    return normalized.length ? normalized.join('|') : '';
  }
  if (value === null || value === undefined || value === '' || value === '-') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : String(value);
}

function isEmptyScenarioValue(value) {
  const comparable = comparableCellValue(value);
  return comparable === '' || comparable === 0;
}

export function plusColumnHasDeviation(rows = [], column, plusColumn = `${column}+`) {
  return rows.some((row) => {
    if (!Object.prototype.hasOwnProperty.call(row, plusColumn)) return false;
    return comparableCellValue(row[column]) !== comparableCellValue(row[plusColumn]);
  });
}

export function hiddenEqualPlusColumns(rows = []) {
  const columns = getColumns(rows);
  return columns.filter((column) => {
    if (!column.endsWith('+')) return false;
    const baseColumn = column.slice(0, -1);
    if (columns.includes(baseColumn)) return !plusColumnHasDeviation(rows, baseColumn, column);
    return rows.every((row) => isEmptyScenarioValue(row[column]));
  });
}

function pairedMetricColumns(rows = [], column) {
  const plusColumn = `${column}+`;
  if (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))) return [];
  return plusColumnHasDeviation(rows, column, plusColumn) ? [column, plusColumn] : [column];
}

export function scenarioComparisonColumns(rows = []) {
  return scenarioComparisonColumnState(rows).columns;
}

const SCENARIO_METRIC_COLUMNS = [
  'Income',
  'Total Debt Payments',
  'Bills',
  'Interest',
  'Principal',
  'Total Debt Balance',
  'Debts Paid Off',
  'Monthly Surplus',
  'Cash Balance',
];

export function scenarioComparisonColumnState(rows = []) {
  const columns = getColumns(rows);
  const defaultColumns = [
    'month',
    ...SCENARIO_METRIC_COLUMNS.flatMap((column) => pairedMetricColumns(rows, column)),
  ];
  const defaultSet = new Set(defaultColumns);
  const dynamicDeviationColumns = columns.flatMap((column) => {
    if (!column.endsWith('+') || defaultSet.has(column)) return [];
    const baseColumn = column.slice(0, -1);
    if (columns.includes(baseColumn)) {
      if (!plusColumnHasDeviation(rows, baseColumn, column)) return [];
      if (defaultSet.has(baseColumn)) return [column];
      return [baseColumn, column];
    }
    if (rows.every((row) => isEmptyScenarioValue(row[column]))) return [];
    return [column];
  });
  const availableColumns = [
    ...defaultColumns,
    ...dynamicDeviationColumns.filter((column, index, list) => list.indexOf(column) === index),
  ];
  const availableSet = new Set(availableColumns);
  return {
    columns: availableColumns,
    defaultColumns,
    hiddenColumns: columns.filter((column) => !availableSet.has(column)),
  };
}

export function columnLabel(column) {
  if (column === 'month') return 'Month';
  if (column === 'Total Debt') return 'Total Debt Balance';
  if (column === 'Remaining Cash') return 'Monthly Surplus';
  if (column === 'Remaining Cash+') return 'Monthly Surplus+';
  if (column === 'Net Change') return 'Net Change';
  return column
    .replace(/\+/g, '+')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function filterRows(rows = [], filters = {}) {
  const start = filters.startMonth || '';
  const end = filters.endMonth || '';
  return rows.filter((row) => {
    const month = String(row.month || '').slice(0, 7);
    if (start && month < start) return false;
    if (end && month > end) return false;
    return true;
  });
}

export function groupRowsByYear(rows = []) {
  return rows.reduce((groups, row) => {
    const year = String(row.month || '').slice(0, 4) || 'Other';
    if (!groups[year]) groups[year] = [];
    groups[year].push(row);
    return groups;
  }, {});
}

export function normalizeProjectionRows(rows = []) {
  return rows.map((row) => {
    const payments = Number(row['Total Debt Payments'] ?? 0);
    const interest = Number(row['Total Interest Charged'] ?? row.Interest ?? 0);
    const normalized = {
      ...row,
      Bills: row['Bills'] ?? 0,
      Interest: interest,
      Principal: Math.max(payments - interest, 0),
      'Total Debt Balance': row['Total Debt Balance'] ?? row['Total Debt'] ?? 0,
      'Monthly Surplus': row['Monthly Surplus'] ?? row['Remaining Cash'] ?? 0,
    };
    if (row['Total Debt Payments+'] !== undefined || row['Bills+'] !== undefined || row['Total Interest Charged+'] !== undefined || row['Total Debt+'] !== undefined || row['Monthly Surplus+'] !== undefined || row['Remaining Cash+'] !== undefined) {
      const scenarioPayments = Number(row['Total Debt Payments+'] ?? row['Total Debt Payments'] ?? 0);
      const scenarioBills = Number(row['Bills+'] ?? row['Bills'] ?? 0);
      const scenarioInterest = Number(row['Total Interest Charged+'] ?? row['Total Interest Charged'] ?? 0);
      normalized['Bills+'] = scenarioBills;
      normalized['Interest+'] = scenarioInterest;
      normalized['Principal+'] = Math.max(scenarioPayments - scenarioInterest, 0);
      normalized['Total Debt Balance+'] = row['Total Debt Balance+'] ?? row['Total Debt+'] ?? row['Total Debt'] ?? 0;
      normalized['Monthly Surplus+'] = row['Monthly Surplus+'] ?? row['Remaining Cash+'] ?? row['Monthly Surplus'] ?? row['Remaining Cash'] ?? 0;
    }
    return normalized;
  });
}

export function isMoneyColumn(column) {
  return (
    column !== 'month' &&
    !column.includes('Paid Off') &&
    !column.toLowerCase().includes('date') &&
    !column.toLowerCase().includes('month') &&
    !column.toLowerCase().includes('apr')
  );
}
