require('dotenv').config();

const crypto = require('crypto');
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
    projections.push(await fetchJson(`${baseUrl}/projections/${summary.id}`));
  }

  return projections;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }

  return value;
}

function hashPayload(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function compareProjection(reference, mongoProjection) {
  const generatedRowsHash = hashPayload(reference.generated_rows);
  const mongoGeneratedRowsHash = hashPayload(mongoProjection?.generated_rows || []);
  const assumptionsHash = hashPayload(reference.assumptions_snapshot);
  const mongoAssumptionsHash = hashPayload(mongoProjection?.assumptions_snapshot || null);
  const metadataMatches = Boolean(mongoProjection)
    && reference.title === mongoProjection.title
    && reference.projection_type === mongoProjection.projection_type
    && reference.notes === mongoProjection.notes
    && reference.created_at === mongoProjection.created_at
    && reference.updated_at === mongoProjection.updated_at;

  return {
    legacyId: reference.id,
    title: reference.title,
    projection_type: reference.projection_type,
    generatedRows: {
      fastapi: reference.generated_rows.length,
      mongo: mongoProjection?.generated_rows?.length || 0,
      matches: generatedRowsHash === mongoGeneratedRowsHash,
      fastapiHash: generatedRowsHash,
      mongoHash: mongoGeneratedRowsHash,
    },
    assumptionsSnapshot: {
      matches: assumptionsHash === mongoAssumptionsHash,
      fastapiHash: assumptionsHash,
      mongoHash: mongoAssumptionsHash,
    },
    metadataMatches,
    result: metadataMatches
      && generatedRowsHash === mongoGeneratedRowsHash
      && assumptionsHash === mongoAssumptionsHash
      ? 'PASS'
      : 'FAIL',
  };
}

async function legacyIdSummary() {
  const missingLegacyIds = await SavedProjection.countDocuments({
    $or: [{ legacyId: { $exists: false } }, { legacyId: null }],
  });
  const duplicateLegacyIds = await SavedProjection.aggregate([
    { $group: { _id: '$legacyId', count: { $sum: 1 } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
  ]);

  return {
    records: await SavedProjection.countDocuments(),
    missingLegacyIds,
    duplicateLegacyIds: duplicateLegacyIds.length,
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for projection payload verification.');
  }

  const referenceProjections = await fetchReferenceProjections();

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    const mongoProjections = await SavedProjection.find().lean();
    const mongoByLegacyId = new Map(mongoProjections.map((projection) => [Number(projection.legacyId), projection]));
    const comparisons = referenceProjections.map((projection) => (
      compareProjection(projection, mongoByLegacyId.get(Number(projection.id)))
    ));
    const legacyIds = await legacyIdSummary();
    const payloadsPass = comparisons.every((comparison) => comparison.result === 'PASS');
    const legacyIdsPass = legacyIds.missingLegacyIds === 0 && legacyIds.duplicateLegacyIds === 0;

    console.log(JSON.stringify({
      fastApiBaseUrl: fastApiBaseUrl(),
      status: payloadsPass && legacyIdsPass ? 'verified' : 'mismatch',
      projectionCount: {
        fastapi: referenceProjections.length,
        mongo: mongoProjections.length,
        matches: referenceProjections.length === mongoProjections.length,
      },
      scenarioCount: {
        fastapi: referenceProjections.filter((projection) => projection.projection_type === 'scenario').length,
        mongo: mongoProjections.filter((projection) => projection.projection_type === 'scenario').length,
        matches: referenceProjections.filter((projection) => projection.projection_type === 'scenario').length
          === mongoProjections.filter((projection) => projection.projection_type === 'scenario').length,
      },
      legacyIds,
      comparisons,
    }, null, 2));

    if (!payloadsPass || !legacyIdsPass) {
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
