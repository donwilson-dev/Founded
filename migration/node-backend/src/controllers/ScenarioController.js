const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Scenario = require('../models/Scenario');
const {
  generateNativeScenario,
  saveNativeScenario,
} = require('../services/scenarioEngineAdapter');

function scenarioResponse(scenario) {
  if (!scenario) return scenario;
  return {
    ...scenario,
    id: scenario.legacyId ?? String(scenario._id),
  };
}

async function generateScenario(req, res, next) {
  try {
    res.json(await generateNativeScenario(req.body));
  } catch (error) {
    next(error);
  }
}

async function saveScenario(req, res, next) {
  try {
    res.json(scenarioResponse(await saveNativeScenario(req.body)));
  } catch (error) {
    next(error);
  }
}

async function listScenarios(_req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const scenarios = await Scenario.find({ projection_type: 'scenario' })
      .sort({ updated_at: -1, legacyId: -1 })
      .lean();
    res.json(scenarios.map(scenarioResponse));
  } catch (error) {
    next(error);
  }
}

async function getScenario(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const { id } = req.params;
    const isLegacyId = Number.isFinite(Number(id));

    if (!isLegacyId && !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({
        status: 'not-found',
        message: 'Scenario not found',
      });
      return;
    }

    const query = isLegacyId ? { legacyId: Number(id) } : { _id: id };
    const scenario = await Scenario.findOne({ ...query, projection_type: 'scenario' }).lean();

    if (!scenario) {
      res.status(404).json({
        status: 'not-found',
        message: 'Scenario not found',
      });
      return;
    }

    res.json(scenarioResponse(scenario));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  generateScenario,
  getScenario,
  listScenarios,
  saveScenario,
};
