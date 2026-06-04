require('dotenv').config();

const mongoose = require('mongoose');
const Account = require('../src/models/Account');
const Debt = require('../src/models/Debt');
const Income = require('../src/models/Income');
const InterestRate = require('../src/models/InterestRate');
const SavedProjection = require('../src/models/SavedProjection');
const { DATASET_VERSION, expectedCounts, relationshipCounts } = require('./datasetV1');

async function countDocuments() {
  return {
    accountBalances: await Account.countDocuments(),
    incomeSources: await Income.countDocuments(),
    debts: await Debt.countDocuments(),
    interestRates: await InterestRate.countDocuments(),
    savedProjections: await SavedProjection.countDocuments(),
    scenarios: await SavedProjection.countDocuments({ projection_type: 'scenario' }),
  };
}

async function verifyRelationships() {
  const missingIncomeAccounts = await Income.countDocuments({
    is_account_transfer: { $ne: true },
    $or: [{ account_balance_id: { $exists: false } }, { account_balance_id: null }],
  });
  const missingTransferAccounts = await Income.countDocuments({
    is_account_transfer: true,
    $or: [
      { from_account_id: { $exists: false } },
      { from_account_id: null },
      { to_account_id: { $exists: false } },
      { to_account_id: null },
      { $expr: { $eq: ['$from_account_id', '$to_account_id'] } },
    ],
  });
  const missingDebtAccounts = await Debt.countDocuments({
    $or: [{ account_balance_id: { $exists: false } }, { account_balance_id: null }],
  });
  const missingInterestRateDebtRefs = await InterestRate.countDocuments({
    $or: [{ debt_id: { $exists: false } }, { debt_id: null }],
  });
  const otherDebtsWithInterestRates = await InterestRate.aggregate([
    {
      $lookup: {
        from: 'debts',
        localField: 'debt_id',
        foreignField: '_id',
        as: 'debt',
      },
    },
    { $unwind: '$debt' },
    { $match: { 'debt.debt_type': 'other' } },
    { $count: 'count' },
  ]);

  return {
    missingIncomeAccounts,
    missingTransferAccounts,
    missingDebtAccounts,
    missingInterestRateDebtRefs,
    otherDebtsWithInterestRates: otherDebtsWithInterestRates[0]?.count || 0,
  };
}

async function verifyRequiredFields() {
  return {
    accountsMissingRequiredFields: await Account.countDocuments({
      $or: [{ name: { $in: [null, ''] } }, { amount: null }, { date: { $in: [null, ''] } }],
    }),
    incomeMissingRequiredFields: await Income.countDocuments({
      $or: [{ label: { $in: [null, ''] } }, { amount: null }, { start_date: { $in: [null, ''] } }],
    }),
    debtsMissingRequiredFields: await Debt.countDocuments({
      $or: [
        { name: { $in: [null, ''] } },
        { debt_type: { $in: [null, ''] } },
        { starting_balance: null },
        { current_balance: null },
        { minimum_monthly_payment: null },
        { start_date: { $in: [null, ''] } },
      ],
    }),
    interestRatesMissingRequiredFields: await InterestRate.countDocuments({
      $or: [{ apr_percentage: null }, { start_date: { $in: [null, ''] } }],
    }),
    savedProjectionsMissingRequiredFields: await SavedProjection.countDocuments({
      $or: [
        { title: { $in: [null, ''] } },
        { projection_type: { $in: [null, ''] } },
        { assumptions_snapshot: null },
        { generated_rows: null },
      ],
    }),
  };
}

function compareCounts(actual, expected) {
  return Object.entries(expected).map(([key, expectedCount]) => ({
    collection: key,
    expected: expectedCount,
    actual: actual[key],
    matches: actual[key] === expectedCount,
  }));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.log(JSON.stringify({
      datasetVersion: DATASET_VERSION,
      status: 'not-configured',
      message: 'MONGODB_URI is not configured. Dataset verification is deferred.',
      expectedCounts: expectedCounts(),
      relationshipCounts: relationshipCounts(),
    }, null, 2));
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    const actualCounts = await countDocuments();
    const countComparison = compareCounts(actualCounts, expectedCounts());
    const relationships = await verifyRelationships();
    const requiredFields = await verifyRequiredFields();
    const countsMatch = countComparison.every((result) => result.matches);
    const relationshipsPass = Object.values(relationships).every((count) => count === 0);
    const requiredFieldsPass = Object.values(requiredFields).every((count) => count === 0);

    console.log(JSON.stringify({
      datasetVersion: DATASET_VERSION,
      status: countsMatch && relationshipsPass && requiredFieldsPass ? 'verified' : 'mismatch',
      countComparison,
      relationships,
      requiredFields,
    }, null, 2));

    if (!countsMatch || !relationshipsPass || !requiredFieldsPass) {
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
