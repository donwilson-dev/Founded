const SavedProjection = require('../models/SavedProjection');
const Scenario = require('../models/Scenario');
const { findByIdentifier, nextLegacyId } = require('./writeValidation');
const { generateBaselineProjection } = require('./calculations/baselineProjection');
const {
  baselineStartMonth,
  buildScenarioGenerationResponse,
  buildScenarioSavePayload,
} = require('./calculations/scenarioProjection');

function nowIso() {
  return new Date().toISOString();
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function findBaselineProjection(baselineProjectionId) {
  if (baselineProjectionId === undefined || baselineProjectionId === null || baselineProjectionId === '') {
    throw httpError(404, 'Baseline projection not found');
  }

  const baseline = await findByIdentifier(SavedProjection, baselineProjectionId, 'Baseline projection');

  if (!baseline || baseline.projection_type !== 'baseline') {
    throw httpError(404, 'Baseline projection not found');
  }
  return baseline.toObject ? baseline.toObject() : baseline;
}

function currentMonthIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
}

function preparedBaselineProjection(baseline) {
  if (baseline.generated_rows && baseline.generated_rows.length > 0) {
    return baseline;
  }

  const assumptions = baseline.assumptions_snapshot || {};
  if (!['income_sources', 'debts', 'account_balances'].some((key) => assumptions[key]?.length)) {
    throw httpError(400, 'Selected baseline has no generated rows');
  }

  const generated = generateBaselineProjection(
    assumptions.income_sources || [],
    assumptions.debts || [],
    assumptions.interest_rates || [],
    currentMonthIso(),
    60,
    null,
    assumptions.account_balances || [],
  );

  return {
    ...baseline,
    generated_rows: generated.generated_rows,
    assumptions_snapshot: generated.assumptions_snapshot,
  };
}

async function generateNativeScenario(payload) {
  const baseline = preparedBaselineProjection(await findBaselineProjection(payload.baseline_projection_id));
  baselineStartMonth(baseline.generated_rows);
  return buildScenarioGenerationResponse(baseline, payload);
}

async function saveNativeScenario(payload) {
  const baseline = preparedBaselineProjection(await findBaselineProjection(payload.baseline_projection_id));
  const savePayload = buildScenarioSavePayload(baseline, payload);
  const cleanTitle = savePayload.title;
  let scenario = await Scenario.findOne({
    projection_type: 'scenario',
    title: cleanTitle,
  });

  if (scenario) {
    scenario.notes = savePayload.notes;
    scenario.assumptions_snapshot = savePayload.assumptions_snapshot;
    scenario.generated_rows = savePayload.generated_rows;
    scenario.updated_at = nowIso();
  } else {
    scenario = new Scenario({
      legacyId: await nextLegacyId(SavedProjection),
      title: cleanTitle,
      projection_type: 'scenario',
      notes: savePayload.notes,
      assumptions_snapshot: savePayload.assumptions_snapshot,
      generated_rows: savePayload.generated_rows,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  await scenario.save();
  return scenario.toObject();
}

module.exports = {
  findBaselineProjection,
  generateNativeScenario,
  preparedBaselineProjection,
  saveNativeScenario,
};
