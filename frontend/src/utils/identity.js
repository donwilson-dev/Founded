export function getRecordId(record) {
  return record?.id ?? record?.legacyId ?? record?._id;
}

export function sameRecordId(left, right) {
  const leftId = identityValue(left);
  const rightId = identityValue(right);
  if (leftId === undefined || leftId === null || leftId === '') return false;
  if (rightId === undefined || rightId === null || rightId === '') return false;
  return String(leftId) === String(rightId);
}

export function getAccountRefId(record = {}) {
  return record.legacy_account_balance_id ?? record.account_balance_id ?? record.accountBalanceId ?? '';
}

export function getDebtRefId(record = {}) {
  return getAccountRefId(record);
}

export function getRateDebtId(rate = {}) {
  return rate.legacy_debt_id ?? rate.debt_id ?? rate.debtId ?? '';
}

export function getFromAccountRefId(record = {}) {
  return record.legacy_from_account_id ?? record.from_account_id ?? record.fromAccountId ?? '';
}

export function getToAccountRefId(record = {}) {
  return record.legacy_to_account_id ?? record.to_account_id ?? record.toAccountId ?? '';
}

function identityValue(value) {
  if (value && typeof value === 'object') return getRecordId(value);
  return value;
}
