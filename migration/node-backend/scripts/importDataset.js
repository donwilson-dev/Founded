require('dotenv').config();

const mongoose = require('mongoose');

const {
  Account,
  Debt,
  Income,
  InterestRate,
  SavedProjection,
} = require('../src/models');
const {
  DATASET_VERSION,
  accounts,
  debts,
  incomeSources,
  interestRates,
  preview,
  savedProjectionAnchors,
  validationAnchors,
} = require('./datasetV1');

function printPreview() {
  console.log(JSON.stringify(preview(), null, 2));
}

function printUsage() {
  console.log('Usage: node scripts/importDataset.js [preview|import]');
}

function validationAnchorFor(title) {
  return validationAnchors.find((anchor) => anchor.title === title) || null;
}

async function upsertByLegacyId(Model, payload) {
  const existing = await Model.findOne({ legacyId: payload.legacyId });
  const document = await Model.findOneAndUpdate(
    { legacyId: payload.legacyId },
    { $set: payload },
    {
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
      upsert: true,
    },
  );

  return {
    document,
    inserted: !existing,
    updated: Boolean(existing),
  };
}

function track(summary, collection, result) {
  summary.recordsProcessed += 1;
  summary.collections[collection].processed += 1;

  if (result.inserted) {
    summary.recordsInserted += 1;
    summary.collections[collection].inserted += 1;
  }

  if (result.updated) {
    summary.recordsUpdated += 1;
    summary.collections[collection].updated += 1;
  }
}

async function importDataset() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for dataset import.');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const summary = {
    datasetVersion: DATASET_VERSION,
    status: 'imported',
    recordsProcessed: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    warnings: [],
    errors: [],
    collections: {
      accountBalances: { processed: 0, inserted: 0, updated: 0 },
      incomeSources: { processed: 0, inserted: 0, updated: 0 },
      debts: { processed: 0, inserted: 0, updated: 0 },
      interestRates: { processed: 0, inserted: 0, updated: 0 },
      savedProjections: { processed: 0, inserted: 0, updated: 0 },
    },
  };

  try {
    const accountByKey = new Map();

    for (const account of accounts) {
      const result = await upsertByLegacyId(Account, {
        legacyId: account.legacyId,
        name: account.name,
        owner: account.owner,
        account_type: account.account_type,
        amount: account.amount,
        date: account.date,
        notes: account.notes,
        active: account.active,
      });

      accountByKey.set(account.key, result.document);
      track(summary, 'accountBalances', result);
    }

    for (const incomeSource of incomeSources) {
      const account = incomeSource.accountKey ? accountByKey.get(incomeSource.accountKey) : null;
      const fromAccount = incomeSource.fromAccountKey ? accountByKey.get(incomeSource.fromAccountKey) : null;
      const toAccount = incomeSource.toAccountKey ? accountByKey.get(incomeSource.toAccountKey) : null;

      if (incomeSource.accountKey && !account) {
        throw new Error(`Missing account reference for income source ${incomeSource.label}`);
      }

      if (incomeSource.is_account_transfer && (!fromAccount || !toAccount)) {
        throw new Error(`Missing transfer account reference for income source ${incomeSource.label}`);
      }

      const result = await upsertByLegacyId(Income, {
        legacyId: incomeSource.legacyId,
        account_balance_id: account?._id,
        legacy_account_balance_id: account?.legacyId,
        is_account_transfer: incomeSource.is_account_transfer,
        from_account_id: fromAccount?._id,
        legacy_from_account_id: fromAccount?.legacyId,
        to_account_id: toAccount?._id,
        legacy_to_account_id: toAccount?.legacyId,
        label: incomeSource.label,
        amount: incomeSource.amount,
        start_date: incomeSource.start_date,
        end_date: incomeSource.end_date,
        frequency: incomeSource.frequency,
        notes: incomeSource.notes,
        active: incomeSource.active,
      });

      track(summary, 'incomeSources', result);
    }

    const debtByName = new Map();

    for (const debt of debts) {
      const account = debt.accountKey ? accountByKey.get(debt.accountKey) : null;

      if (debt.accountKey && !account) {
        throw new Error(`Missing account reference for debt ${debt.name}`);
      }

      const result = await upsertByLegacyId(Debt, {
        legacyId: debt.legacyId,
        account_balance_id: account?._id,
        legacy_account_balance_id: account?.legacyId,
        name: debt.name,
        debt_type: debt.debt_type,
        starting_balance: debt.starting_balance,
        current_balance: debt.current_balance,
        minimum_monthly_payment: debt.minimum_monthly_payment,
        planned_extra_payment: debt.planned_extra_payment,
        recurrence: debt.recurrence,
        payment_due_day: debt.payment_due_day,
        payment_date: debt.payment_date,
        start_date: debt.start_date,
        payoff_target_date: debt.payoff_target_date,
        priority_number: debt.priority_number,
        active: debt.active,
        notes: debt.notes,
      });

      debtByName.set(debt.name, result.document);
      track(summary, 'debts', result);
    }

    for (const interestRate of interestRates) {
      const debt = debtByName.get(interestRate.debtName);

      if (!debt) {
        throw new Error(`Missing debt reference for interest rate ${interestRate.debtName}`);
      }

      const result = await upsertByLegacyId(InterestRate, {
        legacyId: interestRate.legacyId,
        debt_id: debt._id,
        legacy_debt_id: debt.legacyId,
        apr_percentage: interestRate.apr_percentage,
        start_date: interestRate.start_date,
        end_date: interestRate.end_date,
        notes: interestRate.notes,
      });

      track(summary, 'interestRates', result);
    }

    const projectionByKey = new Map();

    for (const projection of savedProjectionAnchors) {
      const baselineProjection = projection.baselineKey ? projectionByKey.get(projection.baselineKey) : null;

      if (projection.baselineKey && !baselineProjection) {
        throw new Error(`Missing baseline projection reference for scenario ${projection.title}`);
      }

      const result = await upsertByLegacyId(SavedProjection, {
        legacyId: projection.legacyId,
        title: projection.title,
        projection_type: projection.projection_type,
        notes: projection.notes,
        assumptions_snapshot: {
          datasetVersion: DATASET_VERSION,
          key: projection.key,
          role: projection.role,
          baselineKey: projection.baselineKey || null,
          baseline_projection_id: baselineProjection?._id || null,
          baseline_projection_legacy_id: baselineProjection?.legacyId || null,
          validation_anchor: validationAnchorFor(projection.title),
        },
        generated_rows: [],
      });

      projectionByKey.set(projection.key, result.document);
      track(summary, 'savedProjections', result);
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const command = process.argv[2] || 'preview';

  if (command === 'preview') {
    printPreview();
    return;
  }

  if (command === 'import') {
    await importDataset();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
