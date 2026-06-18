const {
  firstOfMonth,
  formatDate,
  occurrenceCountForMonth,
  occurrenceDatesForMonth,
} = require('./dateRecurrenceHelpers');
const {
  accountLabel,
  isBill,
  monthlyIncomeAmount,
  toPlainObject,
} = require('./primitives');

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function accountKey(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string' && /^[+-]?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return value;
}

function startingCashBalance(accountBalances, startMonth) {
  const start = firstOfMonth(startMonth);
  let total = 0.0;

  for (const rawBalance of accountBalances || []) {
    const balance = toPlainObject(rawBalance);
    if (!(balance.active ?? true)) {
      continue;
    }
    if (firstOfMonth(balance.date) <= start) {
      total += Number(balance.amount);
    }
  }

  return roundCurrency(total);
}

function transferAmountForMonth(source, month) {
  const plainSource = toPlainObject(source);
  if (!plainSource.is_account_transfer) {
    return 0.0;
  }

  return (
    Number(plainSource.amount || 0) *
    occurrenceCountForMonth(
      plainSource.frequency ?? 'monthly',
      plainSource.start_date,
      plainSource.end_date,
      month,
      { active: plainSource.active ?? true },
    )
  );
}

function emptyAccountActivity() {
  return {
    income: 0.0,
    debt_payments: 0.0,
    bills: 0.0,
    transfers_in: 0.0,
    transfers_out: 0.0,
  };
}

function activityByAccountKey(accountOrder) {
  const activity = new Map();
  for (const key of accountOrder) {
    activity.set(key, emptyAccountActivity());
  }
  return activity;
}

function activityFor(activity, key) {
  if (!activity.has(key)) {
    activity.set(key, emptyAccountActivity());
  }
  return activity.get(key);
}

function availableAccountBalance(balances, accountActivity, key) {
  const activity = activityFor(accountActivity, key);
  return roundCurrency(
    (balances.get(key) || 0.0) +
    activity.income -
    activity.debt_payments -
    activity.bills +
    activity.transfers_in -
    activity.transfers_out,
  );
}

function generateAccountProjectionRows(incomeSources, debts, projectionRows, accountBalances = null) {
  if (!projectionRows || projectionRows.length === 0) {
    return [];
  }

  const incomeData = (incomeSources || []).map(toPlainObject);
  const debtData = (debts || []).map(toPlainObject).filter((debt) => debt.active ?? true);
  const accountData = (accountBalances || []).map(toPlainObject);
  const startMonth = firstOfMonth(projectionRows[0].month);
  const accounts = new Map();
  const accountOrder = [];

  function ensureAccount(accountId, seed = null) {
    const key = accountKey(accountId);
    if (!accounts.has(key)) {
      const raw = { ...(seed || {}) };
      accounts.set(key, {
        account_balance_id: key,
        name: raw.name || (key === null ? 'Unassigned' : `Account ${key}`),
        owner: raw.owner ?? null,
        account_type: raw.account_type ?? null,
      });
      accountOrder.push(key);
    }
    return key;
  }

  const balances = new Map();

  for (const rawAccount of accountData) {
    if (!(rawAccount.active ?? true)) {
      continue;
    }
    const key = ensureAccount(rawAccount.id, rawAccount);
    balances.set(key, 0.0);
    if (rawAccount.date && firstOfMonth(rawAccount.date) <= startMonth) {
      balances.set(key, roundCurrency(Number(rawAccount.amount || 0)));
    }
  }

  for (const source of incomeData) {
    if (source.is_account_transfer) {
      ensureAccount(source.from_account_id);
      ensureAccount(source.to_account_id);
    } else {
      ensureAccount(source.account_balance_id);
    }
  }

  for (const debt of debtData) {
    ensureAccount(debt.account_balance_id);
  }

  for (const key of accountOrder) {
    if (!balances.has(key)) {
      balances.set(key, 0.0);
    }
  }

  const rows = [];
  for (const projectionRow of projectionRows) {
    const month = firstOfMonth(projectionRow.month);
    const accountActivity = activityByAccountKey(accountOrder);
    const transferEvents = [];

    incomeData.forEach((source, sourceIndex) => {
      if (source.is_account_transfer) {
        const fromKey = ensureAccount(source.from_account_id);
        const toKey = ensureAccount(source.to_account_id);
        if (!balances.has(fromKey)) {
          balances.set(fromKey, 0.0);
        }
        if (!balances.has(toKey)) {
          balances.set(toKey, 0.0);
        }
        const amount = Number(source.amount || 0);
        for (const occurrenceDate of occurrenceDatesForMonth(
          source.frequency ?? 'monthly',
          source.start_date,
          source.end_date,
          month,
          { active: source.active ?? true },
        )) {
          transferEvents.push({
            occurrenceDate,
            sourceIndex,
            amount,
            fromKey,
            toKey,
          });
        }
      } else {
        const amount = monthlyIncomeAmount(source, month);
        const key = ensureAccount(source.account_balance_id);
        if (!balances.has(key)) {
          balances.set(key, 0.0);
        }
        activityFor(accountActivity, key).income += amount;
      }
    });

    for (const debt of debtData) {
      const key = ensureAccount(debt.account_balance_id);
      if (!balances.has(key)) {
        balances.set(key, 0.0);
      }
      const name = debt._projection_label || debt.name;
      if (!name) {
        continue;
      }
      if (isBill(debt)) {
        activityFor(accountActivity, key).bills += Number(projectionRow[`${name} Bill`] || 0);
      } else {
        activityFor(accountActivity, key).debt_payments += Number(projectionRow[`${name} Payment`] || 0);
      }
    }

    transferEvents
      .sort((left, right) =>
        left.occurrenceDate.getTime() - right.occurrenceDate.getTime() ||
        left.sourceIndex - right.sourceIndex
      )
      .forEach(({ amount, fromKey, toKey }) => {
        if (amount <= 0) {
          return;
        }
        if (availableAccountBalance(balances, accountActivity, fromKey) < amount) {
          return;
        }
        activityFor(accountActivity, fromKey).transfers_out += amount;
        activityFor(accountActivity, toKey).transfers_in += amount;
      });

    const accountRows = [];
    for (const key of accountOrder) {
      const activity = activityFor(accountActivity, key);
      const startingBalance = balances.get(key) || 0.0;
      const endingBalance =
        startingBalance +
        activity.income -
        activity.debt_payments -
        activity.bills +
        activity.transfers_in -
        activity.transfers_out;
      balances.set(key, roundCurrency(endingBalance));
      const account = accounts.get(key);
      accountRows.push({
        account_balance_id: account.account_balance_id,
        name: account.name,
        label: accountLabel(account),
        owner: account.owner,
        account_type: account.account_type,
        starting_balance: roundCurrency(startingBalance),
        income: roundCurrency(activity.income),
        debt_payments: roundCurrency(activity.debt_payments),
        bills: roundCurrency(activity.bills),
        transfers_in: roundCurrency(activity.transfers_in),
        transfers_out: roundCurrency(activity.transfers_out),
        cash_balance: roundCurrency(balances.get(key)),
      });
    }

    rows.push({
      month: formatDate(projectionRow.month),
      accounts: accountRows,
      total_cash_balance: roundCurrency(
        accountRows.reduce((total, account) => total + account.cash_balance, 0),
      ),
    });
  }

  return rows;
}

function ownerCashTotals(accountProjectionRow) {
  const totals = {};
  for (const account of accountProjectionRow.accounts || []) {
    const owner = account.owner ?? null;
    const key = owner === null ? 'Unassigned' : String(owner);
    totals[key] = roundCurrency((totals[key] || 0) + Number(account.cash_balance || 0));
  }
  return totals;
}

module.exports = {
  accountKey,
  startingCashBalance,
  transferAmountForMonth,
  emptyAccountActivity,
  generateAccountProjectionRows,
  ownerCashTotals,
};
