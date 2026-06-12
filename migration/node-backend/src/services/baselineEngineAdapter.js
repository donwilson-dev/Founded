const Account = require('../models/Account');
const Debt = require('../models/Debt');
const Income = require('../models/Income');
const InterestRate = require('../models/InterestRate');
const SavedProjection = require('../models/SavedProjection');
const { generateBaselineProjection } = require('./calculations/baselineProjection');
const { MAX_PROJECTION_MONTHS, formatDate, firstOfMonth, inclusiveMonthCount } = require('./calculations/dateRecurrenceHelpers');
const { nextLegacyId } = require('./writeValidation');

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanId(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return String(value);
}

function calculationId(document) {
  if (document.legacyId !== null && document.legacyId !== undefined) {
    return document.legacyId;
  }
  return cleanId(document._id);
}

function normalizedAccount(rawAccount) {
  return {
    id: calculationId(rawAccount),
    name: rawAccount.name,
    owner: rawAccount.owner ?? null,
    account_type: rawAccount.account_type ?? null,
    amount: rawAccount.amount,
    date: rawAccount.date,
    notes: rawAccount.notes ?? null,
    active: rawAccount.active ?? true,
  };
}

function normalizedIncome(rawIncome) {
  return {
    id: calculationId(rawIncome),
    account_balance_id: rawIncome.legacy_account_balance_id ?? cleanId(rawIncome.account_balance_id) ?? null,
    is_account_transfer: rawIncome.is_account_transfer ?? false,
    from_account_id: rawIncome.legacy_from_account_id ?? cleanId(rawIncome.from_account_id) ?? null,
    to_account_id: rawIncome.legacy_to_account_id ?? cleanId(rawIncome.to_account_id) ?? null,
    label: rawIncome.label,
    amount: rawIncome.amount,
    start_date: rawIncome.start_date,
    end_date: rawIncome.end_date ?? null,
    frequency: rawIncome.frequency ?? 'monthly',
    notes: rawIncome.notes ?? null,
    active: rawIncome.active ?? true,
  };
}

function normalizedDebt(rawDebt) {
  return {
    id: calculationId(rawDebt),
    account_balance_id: rawDebt.legacy_account_balance_id ?? cleanId(rawDebt.account_balance_id) ?? null,
    name: rawDebt.name,
    debt_type: rawDebt.debt_type,
    starting_balance: rawDebt.starting_balance,
    current_balance: rawDebt.current_balance,
    minimum_monthly_payment: rawDebt.minimum_monthly_payment,
    planned_extra_payment: rawDebt.planned_extra_payment ?? 0,
    recurrence: rawDebt.recurrence ?? null,
    payment_due_day: rawDebt.payment_due_day ?? null,
    payment_date: rawDebt.payment_date ?? null,
    start_date: rawDebt.start_date,
    payoff_target_date: rawDebt.payoff_target_date ?? null,
    priority_number: rawDebt.priority_number ?? null,
    active: rawDebt.active ?? true,
    notes: rawDebt.notes ?? null,
  };
}

function normalizedInterestRate(rawRate) {
  return {
    id: calculationId(rawRate),
    debt_id: rawRate.legacy_debt_id ?? cleanId(rawRate.debt_id),
    apr_percentage: rawRate.apr_percentage,
    start_date: rawRate.start_date,
    end_date: rawRate.end_date ?? null,
    notes: rawRate.notes ?? null,
  };
}

function idFilter(values, legacyField = 'legacyId') {
  if (values === null || values === undefined) {
    return {};
  }
  if (!Array.isArray(values)) {
    throw httpError(422, `${legacyField} filter must be an array.`);
  }
  const numericValues = values.map((value) => Number(value)).filter(Number.isFinite);
  if (numericValues.length !== values.length) {
    throw httpError(422, `${legacyField} filter must contain valid numeric ids.`);
  }
  return { [legacyField]: { $in: numericValues } };
}

function validateDate(value, field) {
  if (value === null || value === undefined || value === '') {
    throw httpError(422, `${field} is required.`);
  }
  try {
    return formatDate(firstOfMonth(String(value).slice(0, 10)));
  } catch (_error) {
    throw httpError(422, `${field} must be a valid date.`);
  }
}

function validatedProjectionPayload(payload = {}) {
  const startMonth = validateDate(payload.start_month, 'start_month');
  const endMonth = payload.end_month ? validateDate(payload.end_month, 'end_month') : null;
  let months = payload.months === null || payload.months === undefined ? 60 : Number(payload.months);

  if (!Number.isInteger(months) || months < 1 || months > MAX_PROJECTION_MONTHS) {
    throw httpError(422, `months must be between 1 and ${MAX_PROJECTION_MONTHS}.`);
  }
  if (endMonth) {
    const monthCount = inclusiveMonthCount(startMonth, endMonth);
    if (monthCount > MAX_PROJECTION_MONTHS) {
      throw httpError(422, 'projection range cannot exceed 25 years');
    }
    months = null;
  }

  return {
    startMonth,
    months,
    endMonth,
    accountBalanceIds: payload.account_balance_ids,
    incomeSourceIds: payload.income_source_ids,
    debtIds: payload.debt_ids,
  };
}

async function currentFinancialInputs({
  accountBalanceIds = null,
  incomeSourceIds = null,
  debtIds = null,
  ignoreFilters = false,
} = {}) {
  const accountFilter = ignoreFilters ? {} : idFilter(accountBalanceIds);
  const incomeFilter = ignoreFilters ? {} : idFilter(incomeSourceIds);
  const debtFilter = ignoreFilters ? {} : idFilter(debtIds);
  const rateFilter = ignoreFilters ? {} : idFilter(debtIds, 'legacy_debt_id');

  const [accounts, income, debts, rates] = await Promise.all([
    Account.find(accountFilter).sort({ date: -1, legacyId: 1, _id: 1 }).lean(),
    Income.find(incomeFilter).sort({ legacyId: 1, _id: 1 }).lean(),
    Debt.find(debtFilter).sort({ legacyId: 1, _id: 1 }).lean(),
    InterestRate.find(rateFilter).sort({ start_date: 1, legacyId: 1, _id: 1 }).lean(),
  ]);

  return {
    accountBalances: accounts.map(normalizedAccount),
    incomeSources: income.map(normalizedIncome),
    debts: debts.map(normalizedDebt),
    interestRates: rates.map(normalizedInterestRate),
  };
}

async function generateNativeBaseline(payload = {}, options = {}) {
  const validated = validatedProjectionPayload(payload);
  const inputs = await currentFinancialInputs({
    accountBalanceIds: validated.accountBalanceIds,
    incomeSourceIds: validated.incomeSourceIds,
    debtIds: validated.debtIds,
    ignoreFilters: options.ignoreFilters ?? false,
  });

  return generateBaselineProjection(
    inputs.incomeSources,
    inputs.debts,
    inputs.interestRates,
    validated.startMonth,
    validated.months,
    validated.endMonth,
    inputs.accountBalances,
  );
}

function projectionResponse(projection) {
  const plain = typeof projection.toObject === 'function' ? projection.toObject() : projection;
  return {
    ...plain,
    id: plain.legacyId ?? plain.id ?? plain._id,
  };
}

async function generateAndSaveNativeBaseline(payload = {}, query = {}) {
  const title = String(query.title || '').trim();
  if (!title) {
    throw httpError(422, 'title is required.');
  }

  const generated = await generateNativeBaseline(payload, { ignoreFilters: true });
  const timestamp = nowIso();
  let projection = await SavedProjection.findOne({
    title,
    projection_type: 'baseline',
  });

  if (projection) {
    projection.notes = query.notes ?? null;
    projection.assumptions_snapshot = generated.assumptions_snapshot;
    projection.generated_rows = generated.generated_rows;
    projection.updated_at = timestamp;
  } else {
    projection = new SavedProjection({
      legacyId: await nextLegacyId(SavedProjection),
      title,
      projection_type: 'baseline',
      notes: query.notes ?? null,
      assumptions_snapshot: generated.assumptions_snapshot,
      generated_rows: generated.generated_rows,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  await projection.save();
  return projectionResponse(projection);
}

module.exports = {
  currentFinancialInputs,
  generateAndSaveNativeBaseline,
  generateNativeBaseline,
  normalizedAccount,
  normalizedDebt,
  normalizedIncome,
  normalizedInterestRate,
  validatedProjectionPayload,
};
