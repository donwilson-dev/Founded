require('dotenv').config();

const mongoose = require('mongoose');
const Account = require('../src/models/Account');
const Debt = require('../src/models/Debt');
const Income = require('../src/models/Income');
const InterestRate = require('../src/models/InterestRate');
const SavedProjection = require('../src/models/SavedProjection');
const { DATASET_VERSION, expectedCounts, relationshipCounts } = require('./datasetV1');

const EXPECTED_COLLECTIONS = [
  'accountBalances',
  'debts',
  'incomeSources',
  'interestRates',
  'savedProjections',
];

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
  const scenarioBaselineRelationships = await verifyScenarioBaselineRelationships();
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
  const orphanIncomeAccountReferences = await Income.aggregate([
    { $match: { is_account_transfer: { $ne: true }, account_balance_id: { $ne: null } } },
    {
      $lookup: {
        from: 'accountBalances',
        localField: 'account_balance_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $match: { account: { $size: 0 } } },
    { $count: 'count' },
  ]);
  const orphanTransferFromAccountReferences = await Income.aggregate([
    { $match: { is_account_transfer: true, from_account_id: { $ne: null } } },
    {
      $lookup: {
        from: 'accountBalances',
        localField: 'from_account_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $match: { account: { $size: 0 } } },
    { $count: 'count' },
  ]);
  const orphanTransferToAccountReferences = await Income.aggregate([
    { $match: { is_account_transfer: true, to_account_id: { $ne: null } } },
    {
      $lookup: {
        from: 'accountBalances',
        localField: 'to_account_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $match: { account: { $size: 0 } } },
    { $count: 'count' },
  ]);
  const orphanDebtAccountReferences = await Debt.aggregate([
    { $match: { account_balance_id: { $ne: null } } },
    {
      $lookup: {
        from: 'accountBalances',
        localField: 'account_balance_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $match: { account: { $size: 0 } } },
    { $count: 'count' },
  ]);
  const orphanInterestRateDebtReferences = await InterestRate.aggregate([
    { $match: { debt_id: { $ne: null } } },
    {
      $lookup: {
        from: 'debts',
        localField: 'debt_id',
        foreignField: '_id',
        as: 'debt',
      },
    },
    { $match: { debt: { $size: 0 } } },
    { $count: 'count' },
  ]);
  return {
    missingIncomeAccounts,
    missingTransferAccounts,
    missingDebtAccounts,
    missingInterestRateDebtRefs,
    otherDebtsWithInterestRates: otherDebtsWithInterestRates[0]?.count || 0,
    orphanIncomeAccountReferences: orphanIncomeAccountReferences[0]?.count || 0,
    orphanTransferFromAccountReferences: orphanTransferFromAccountReferences[0]?.count || 0,
    orphanTransferToAccountReferences: orphanTransferToAccountReferences[0]?.count || 0,
    orphanDebtAccountReferences: orphanDebtAccountReferences[0]?.count || 0,
    orphanInterestRateDebtReferences: orphanInterestRateDebtReferences[0]?.count || 0,
    ...scenarioBaselineRelationships,
  };
}

async function verifyScenarioBaselineRelationships() {
  const scenarios = await SavedProjection.find({ projection_type: 'scenario' }).lean();
  const baselines = await SavedProjection.find({ projection_type: 'baseline' }).lean();
  const baselineLegacyIds = new Set(baselines.map((projection) => Number(projection.legacyId)));
  const baselineObjectIds = new Set(baselines.map((projection) => String(projection._id)));

  let missingScenarioBaselineReferences = 0;
  let orphanScenarioBaselineReferences = 0;

  for (const scenario of scenarios) {
    const assumptions = scenario.assumptions_snapshot || {};
    const baselineLegacyId = assumptions.baseline_projection_legacy_id
      ?? (Number.isInteger(assumptions.baseline_projection_id) ? assumptions.baseline_projection_id : null);
    const baselineObjectId = assumptions.baseline_projection_id ? String(assumptions.baseline_projection_id) : null;

    if (baselineLegacyId == null && baselineObjectId == null) {
      missingScenarioBaselineReferences += 1;
      continue;
    }

    if (baselineLegacyId != null && baselineLegacyIds.has(Number(baselineLegacyId))) {
      continue;
    }

    if (baselineObjectId != null && baselineObjectIds.has(baselineObjectId)) {
      continue;
    }

    orphanScenarioBaselineReferences += 1;
  }

  return {
    missingScenarioBaselineReferences,
    orphanScenarioBaselineReferences,
  };
}

async function verifyCollectionInventory() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionNames = collections.map((collection) => collection.name).sort();

  return {
    collectionNames,
    missingCollections: EXPECTED_COLLECTIONS.filter((name) => !collectionNames.includes(name)),
    unexpectedCollections: collectionNames.filter((name) => !EXPECTED_COLLECTIONS.includes(name)),
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
    const collectionInventory = await verifyCollectionInventory();
    const countComparison = compareCounts(actualCounts, expectedCounts());
    const relationships = await verifyRelationships();
    const requiredFields = await verifyRequiredFields();
    const countsMatch = countComparison.every((result) => result.matches);
    const inventoryPass = collectionInventory.missingCollections.length === 0
      && collectionInventory.unexpectedCollections.length === 0;
    const relationshipsPass = Object.values(relationships).every((count) => count === 0);
    const requiredFieldsPass = Object.values(requiredFields).every((count) => count === 0);

    console.log(JSON.stringify({
      datasetVersion: DATASET_VERSION,
      status: countsMatch && inventoryPass && relationshipsPass && requiredFieldsPass ? 'verified' : 'mismatch',
      collectionInventory,
      countComparison,
      relationships,
      requiredFields,
    }, null, 2));

    if (!countsMatch || !inventoryPass || !relationshipsPass || !requiredFieldsPass) {
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
