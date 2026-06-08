const mongoose = require('mongoose');

const Account = require('../models/Account');
const Debt = require('../models/Debt');
const Income = require('../models/Income');
const SavedProjection = require('../models/SavedProjection');

const ACCOUNT_REFERENCE_MESSAGE =
  'This account is currently referenced by existing records. Reassign or remove dependent records before deleting this account.';

const incomeFrequencies = new Set(['one_time', 'weekly', 'bi_weekly', 'first_and_fifteenth', 'monthly']);
const debtTypes = new Set(['credit_card', 'personal_loan', 'vehicle_loan', 'student_loan', 'other']);
const debtRecurrences = new Set(['one_time', 'weekly', 'bi_weekly', 'first_and_fifteenth', 'monthly']);
const projectionTypes = new Set(['baseline', 'scenario']);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isLegacyIdentifier(value) {
  return Number.isInteger(Number(value)) && String(value).trim() !== '';
}

function isObjectIdentifier(value) {
  return mongoose.Types.ObjectId.isValid(String(value));
}

function identifierQuery(value, label) {
  if (isLegacyIdentifier(value)) return { legacyId: Number(value) };
  if (isObjectIdentifier(value)) return { _id: value };
  throw httpError(404, `${label} not found`);
}

async function findByIdentifier(Model, value, label) {
  return Model.findOne(identifierQuery(value, label));
}

async function findAccountForAssignment(value, label, existingAccountIds = new Set()) {
  if (value === null || value === undefined || value === '') {
    throw httpError(422, `${label} is required.`);
  }

  let query;
  if (isLegacyIdentifier(value)) {
    query = { legacyId: Number(value) };
  } else if (isObjectIdentifier(value)) {
    query = { _id: value };
  } else {
    throw httpError(422, `${label} is no longer available.`);
  }

  const account = await Account.findOne(query);
  if (!account) {
    throw httpError(422, `${label} is no longer available.`);
  }

  const legacyKey = account.legacyId === undefined ? null : String(account.legacyId);
  const objectKey = String(account._id);
  if (account.active === false && !existingAccountIds.has(legacyKey) && !existingAccountIds.has(objectKey)) {
    throw httpError(422, `${label} must be an active account.`);
  }

  return account;
}

async function findDebtForRate(value) {
  if (value === null || value === undefined || value === '') {
    throw httpError(422, 'debt_id is required.');
  }

  let query;
  if (isLegacyIdentifier(value)) {
    query = { legacyId: Number(value) };
  } else if (isObjectIdentifier(value)) {
    query = { _id: value };
  } else {
    throw httpError(404, 'Debt not found');
  }

  const debt = await Debt.findOne(query);
  if (!debt) throw httpError(404, 'Debt not found');
  return debt;
}

async function nextLegacyId(Model) {
  const latest = await Model.findOne({ legacyId: { $type: 'number' } }).sort({ legacyId: -1 }).lean();
  return latest?.legacyId ? latest.legacyId + 1 : 1;
}

function stringField(payload, field, { required = false, max = 120 } = {}) {
  if (payload[field] === undefined) {
    if (required) throw httpError(422, `${field} is required.`);
    return undefined;
  }
  if (payload[field] === null) {
    if (required) throw httpError(422, `${field} is required.`);
    return null;
  }
  const value = String(payload[field]).trim();
  if (required && !value) throw httpError(422, `${field} is required.`);
  if (value.length > max) throw httpError(422, `${field} cannot exceed ${max} characters.`);
  return value || null;
}

function numberField(payload, field, { required = false, min = null, max = null } = {}) {
  if (payload[field] === undefined) {
    if (required) throw httpError(422, `${field} is required.`);
    return undefined;
  }
  if (payload[field] === null || payload[field] === '') {
    if (required) throw httpError(422, `${field} is required.`);
    return null;
  }
  const value = Number(payload[field]);
  if (!Number.isFinite(value)) throw httpError(422, `${field} must be a number.`);
  if (min !== null && value < min) throw httpError(422, `${field} must be greater than or equal to ${min}.`);
  if (max !== null && value > max) throw httpError(422, `${field} must be less than or equal to ${max}.`);
  return value;
}

function booleanField(payload, field, defaultValue = undefined) {
  if (payload[field] === undefined) return defaultValue;
  return Boolean(payload[field]);
}

function enumField(payload, field, values, { required = false, defaultValue = undefined } = {}) {
  if (payload[field] === undefined) {
    if (required) throw httpError(422, `${field} is required.`);
    return defaultValue;
  }
  if (payload[field] === null || payload[field] === '') {
    if (required) throw httpError(422, `${field} is required.`);
    return defaultValue !== undefined ? defaultValue : null;
  }
  const value = String(payload[field]);
  if (!values.has(value)) throw httpError(422, `${field} is not a valid value.`);
  return value;
}

function dateField(payload, field, { required = false } = {}) {
  if (payload[field] === undefined) {
    if (required) throw httpError(422, `${field} is required.`);
    return undefined;
  }
  if (payload[field] === null || payload[field] === '') {
    if (required) throw httpError(422, `${field} is required.`);
    return null;
  }
  const value = String(payload[field]).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw httpError(422, `${field} must be a valid date.`);
  }
  return value;
}

function compactUpdates(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function sameAccount(left, right) {
  if (!left || !right) return false;
  return String(left._id) === String(right._id) || (left.legacyId !== undefined && String(left.legacyId) === String(right.legacyId));
}

function existingAccountKeys(record, keys) {
  const values = new Set();
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) values.add(String(value));
  }
  return values;
}

function snapshotReferencesAccount(value, account) {
  if (Array.isArray(value)) return value.some((item) => snapshotReferencesAccount(item, account));
  if (!value || typeof value !== 'object') return false;

  const legacyId = account.legacyId === undefined ? null : String(account.legacyId);
  const objectId = String(account._id);
  for (const key of ['account_balance_id', 'from_account_id', 'to_account_id']) {
    const candidate = value[key];
    if (candidate === undefined || candidate === null) continue;
    if (legacyId !== null && String(candidate) === legacyId) return true;
    if (String(candidate) === objectId) return true;
  }

  return Object.values(value).some((item) => snapshotReferencesAccount(item, account));
}

async function ensureAccountCanBeDeleted(account) {
  const incomeReferences = [
    { account_balance_id: account._id },
    { from_account_id: account._id },
    { to_account_id: account._id },
  ];
  const debtReferences = [{ account_balance_id: account._id }];
  if (account.legacyId !== undefined && account.legacyId !== null) {
    incomeReferences.push(
      { legacy_account_balance_id: account.legacyId },
      { legacy_from_account_id: account.legacyId },
      { legacy_to_account_id: account.legacyId },
    );
    debtReferences.push({ legacy_account_balance_id: account.legacyId });
  }
  const query = { $or: incomeReferences };
  if (await Income.findOne(query).lean()) throw httpError(409, ACCOUNT_REFERENCE_MESSAGE);
  if (await Debt.findOne({ $or: debtReferences }).lean()) {
    throw httpError(409, ACCOUNT_REFERENCE_MESSAGE);
  }

  const projections = await SavedProjection.find({}, { assumptions_snapshot: 1 }).lean();
  if (projections.some((projection) => snapshotReferencesAccount(projection.assumptions_snapshot, account))) {
    throw httpError(409, ACCOUNT_REFERENCE_MESSAGE);
  }
}

function accountPayload(payload, { requireAll = false } = {}) {
  return compactUpdates({
    name: stringField(payload, 'name', { required: requireAll, max: 120 }),
    owner: stringField(payload, 'owner', { max: 120 }),
    account_type: stringField(payload, 'account_type', { max: 120 }),
    amount: numberField(payload, 'amount', { required: requireAll, min: 0 }),
    date: dateField(payload, 'date', { required: requireAll }),
    notes: stringField(payload, 'notes', { max: 10000 }),
    active: booleanField(payload, 'active', requireAll ? true : undefined),
  });
}

async function incomePayload(payload, existing = null) {
  const values = compactUpdates({
    label: stringField(payload, 'label', { required: !existing, max: 120 }),
    amount: numberField(payload, 'amount', { required: !existing, min: 0 }),
    start_date: dateField(payload, 'start_date', { required: !existing }),
    end_date: dateField(payload, 'end_date'),
    frequency: enumField(payload, 'frequency', incomeFrequencies, { defaultValue: existing ? undefined : 'monthly' }),
    notes: stringField(payload, 'notes', { max: 10000 }),
    active: booleanField(payload, 'active', existing ? undefined : true),
    is_account_transfer: booleanField(payload, 'is_account_transfer', existing ? undefined : false),
  });

  const merged = {
    account_balance_id: existing?.account_balance_id,
    legacy_account_balance_id: existing?.legacy_account_balance_id,
    is_account_transfer: existing?.is_account_transfer || false,
    from_account_id: existing?.from_account_id,
    legacy_from_account_id: existing?.legacy_from_account_id,
    to_account_id: existing?.to_account_id,
    legacy_to_account_id: existing?.legacy_to_account_id,
    start_date: existing?.start_date,
    end_date: existing?.end_date,
    ...values,
  };

  const existingIds = existingAccountKeys(existing, [
    'account_balance_id',
    'legacy_account_balance_id',
    'from_account_id',
    'legacy_from_account_id',
    'to_account_id',
    'legacy_to_account_id',
  ]);

  if (merged.is_account_transfer) {
    const fromAccountId = payload.from_account_id !== undefined ? payload.from_account_id : merged.legacy_from_account_id || merged.from_account_id;
    const toAccountId = payload.to_account_id !== undefined ? payload.to_account_id : merged.legacy_to_account_id || merged.to_account_id;
    const fromAccount = await findAccountForAssignment(fromAccountId, 'From Account', existingIds);
    const toAccount = await findAccountForAssignment(toAccountId, 'To Account', existingIds);
    if (sameAccount(fromAccount, toAccount)) {
      throw httpError(422, 'From Account and To Account must be different.');
    }
    values.account_balance_id = null;
    values.legacy_account_balance_id = null;
    values.from_account_id = fromAccount._id;
    values.legacy_from_account_id = fromAccount.legacyId;
    values.to_account_id = toAccount._id;
    values.legacy_to_account_id = toAccount.legacyId;
  } else {
    const accountId = payload.account_balance_id !== undefined ? payload.account_balance_id : merged.legacy_account_balance_id || merged.account_balance_id;
    const account = await findAccountForAssignment(accountId, 'Account', existingIds);
    values.account_balance_id = account._id;
    values.legacy_account_balance_id = account.legacyId;
    values.from_account_id = null;
    values.legacy_from_account_id = null;
    values.to_account_id = null;
    values.legacy_to_account_id = null;
  }

  const start = values.start_date ?? existing?.start_date;
  const end = values.end_date ?? existing?.end_date;
  if (start && end && end < start) throw httpError(422, 'end_date cannot be before start_date');
  return values;
}

async function debtPayload(payload, existing = null) {
  const values = compactUpdates({
    name: stringField(payload, 'name', { required: !existing, max: 120 }),
    debt_type: enumField(payload, 'debt_type', debtTypes, { required: !existing }),
    starting_balance: numberField(payload, 'starting_balance', { required: !existing, min: 0 }),
    current_balance: numberField(payload, 'current_balance', { required: !existing, min: 0 }),
    minimum_monthly_payment: numberField(payload, 'minimum_monthly_payment', { required: !existing, min: 0 }),
    planned_extra_payment: numberField(payload, 'planned_extra_payment', { min: 0, defaultValue: 0 }),
    recurrence: enumField(payload, 'recurrence', debtRecurrences),
    payment_due_day: numberField(payload, 'payment_due_day', { min: 1, max: 31 }),
    payment_date: dateField(payload, 'payment_date'),
    start_date: dateField(payload, 'start_date', { required: !existing }),
    payoff_target_date: dateField(payload, 'payoff_target_date'),
    priority_number: numberField(payload, 'priority_number', { min: 1 }),
    active: booleanField(payload, 'active', existing ? undefined : true),
    notes: stringField(payload, 'notes', { max: 10000 }),
  });
  if (!existing && values.planned_extra_payment === undefined) values.planned_extra_payment = 0;

  const existingIds = existingAccountKeys(existing, ['account_balance_id', 'legacy_account_balance_id']);
  const accountId = payload.account_balance_id !== undefined ? payload.account_balance_id : existing?.legacy_account_balance_id || existing?.account_balance_id;
  const account = await findAccountForAssignment(accountId, 'Account', existingIds);
  values.account_balance_id = account._id;
  values.legacy_account_balance_id = account.legacyId;

  const start = values.start_date ?? existing?.start_date;
  const payoff = values.payoff_target_date ?? existing?.payoff_target_date;
  if (start && payoff && payoff < start) throw httpError(422, 'payoff_target_date cannot be before start_date');

  return values;
}

async function interestRatePayload(payload, existing = null) {
  const values = compactUpdates({
    apr_percentage: numberField(payload, 'apr_percentage', { required: !existing, min: 0 }),
    start_date: dateField(payload, 'start_date', { required: !existing }),
    end_date: dateField(payload, 'end_date'),
    notes: stringField(payload, 'notes', { max: 10000 }),
  });

  if (!existing) {
    const debt = await findDebtForRate(payload.debt_id);
    values.debt_id = debt._id;
    values.legacy_debt_id = debt.legacyId;
  }

  const start = values.start_date ?? existing?.start_date;
  const end = values.end_date ?? existing?.end_date;
  if (start && end && end < start) throw httpError(422, 'end_date cannot be before start_date');

  return values;
}

function objectField(payload, field, { required = false } = {}) {
  if (payload[field] === undefined) {
    if (required) throw httpError(422, `${field} is required.`);
    return undefined;
  }
  const value = payload[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(422, `${field} must be an object.`);
  }
  return value;
}

function arrayField(payload, field, { required = false } = {}) {
  if (payload[field] === undefined) {
    if (required) throw httpError(422, `${field} is required.`);
    return undefined;
  }
  if (!Array.isArray(payload[field])) {
    throw httpError(422, `${field} must be an array.`);
  }
  return payload[field];
}

function savedProjectionPayload(payload) {
  return {
    title: stringField(payload, 'title', { required: true, max: 160 }),
    projection_type: enumField(payload, 'projection_type', projectionTypes, { required: true }),
    notes: stringField(payload, 'notes', { max: 10000 }),
    assumptions_snapshot: objectField(payload, 'assumptions_snapshot', { required: true }),
    generated_rows: arrayField(payload, 'generated_rows', { required: true }),
  };
}

module.exports = {
  accountPayload,
  debtPayload,
  ensureAccountCanBeDeleted,
  findByIdentifier,
  httpError,
  interestRatePayload,
  incomePayload,
  nextLegacyId,
  savedProjectionPayload,
};
