require('dotenv').config();

const mongoose = require('mongoose');
const SavedProjection = require('../src/models/SavedProjection');

const DEFAULT_FASTAPI_BASE_URL = 'http://127.0.0.1:8000';

function fastApiBaseUrl() {
  return (process.env.FASTAPI_BASE_URL || process.env.FASTAPI_URL || DEFAULT_FASTAPI_BASE_URL).replace(/\/$/, '');
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function fetchReferenceProjections(baseUrl = fastApiBaseUrl()) {
  const summaries = await fetchJson(`${baseUrl}/projections`);
  const projections = [];

  for (const summary of [...summaries].sort((left, right) => left.id - right.id)) {
    const projection = await fetchJson(`${baseUrl}/projections/${summary.id}`);

    if (!Number.isInteger(projection.id)) {
      throw new Error(`Projection ${summary.id} is missing a numeric id.`);
    }

    if (!Array.isArray(projection.generated_rows)) {
      throw new Error(`Projection ${summary.id} is missing generated_rows.`);
    }

    if (!projection.assumptions_snapshot || typeof projection.assumptions_snapshot !== 'object') {
      throw new Error(`Projection ${summary.id} is missing assumptions_snapshot.`);
    }

    projections.push(projection);
  }

  return projections;
}

function toPayload(projection) {
  return {
    legacyId: projection.id,
    title: projection.title,
    projection_type: projection.projection_type,
    notes: projection.notes,
    assumptions_snapshot: projection.assumptions_snapshot,
    generated_rows: projection.generated_rows,
    created_at: projection.created_at,
    updated_at: projection.updated_at,
  };
}

function summarizeProjection(projection) {
  return {
    legacyId: projection.id,
    title: projection.title,
    projection_type: projection.projection_type,
    generatedRows: projection.generated_rows.length,
    assumptionsKeys: Object.keys(projection.assumptions_snapshot || {}).sort(),
    created_at: projection.created_at,
    updated_at: projection.updated_at,
  };
}

function emptySummary(status) {
  return {
    fastApiBaseUrl: fastApiBaseUrl(),
    status,
    recordsProcessed: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    projections: [],
    scenarios: [],
    warnings: [],
    errors: [],
  };
}

async function preview() {
  const projections = await fetchReferenceProjections();

  console.log(JSON.stringify({
    ...emptySummary('preview'),
    recordsProcessed: projections.length,
    projections: projections.map(summarizeProjection),
    scenarios: projections
      .filter((projection) => projection.projection_type === 'scenario')
      .map(summarizeProjection),
  }, null, 2));
}

async function migrate() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for projection payload migration.');
  }

  const projections = await fetchReferenceProjections();

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const summary = emptySummary('migrated');

  try {
    for (const projection of projections) {
      const payload = toPayload(projection);
      const existing = await SavedProjection.findOne({ legacyId: payload.legacyId }).lean();

      const document = await SavedProjection.findOneAndUpdate(
        { legacyId: payload.legacyId },
        { $set: payload },
        {
          returnDocument: 'after',
          runValidators: true,
          setDefaultsOnInsert: true,
          timestamps: false,
          upsert: true,
        },
      ).lean();

      const result = {
        legacyId: document.legacyId,
        title: document.title,
        projection_type: document.projection_type,
        generatedRows: document.generated_rows.length,
        inserted: !existing,
        updated: Boolean(existing),
      };

      summary.recordsProcessed += 1;

      if (result.inserted) {
        summary.recordsInserted += 1;
      }

      if (result.updated) {
        summary.recordsUpdated += 1;
      }

      summary.projections.push(result);

      if (document.projection_type === 'scenario') {
        summary.scenarios.push(result);
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

function printUsage() {
  console.log('Usage: node scripts/migrateProjectionPayloads.js [preview|migrate]');
}

async function main() {
  const command = process.argv[2] || 'preview';

  if (command === 'preview') {
    await preview();
    return;
  }

  if (command === 'migrate') {
    await migrate();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
