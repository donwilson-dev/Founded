const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const SavedProjection = require('../models/SavedProjection');
const { dashboardSummary } = require('./calculations/dashboard');

function dashboardEngineMode() {
  return (process.env.FOUNDED_DASHBOARD_ENGINE || process.env.DASHBOARD_ENGINE || 'bridge').toLowerCase();
}

function useNativeDashboardEngine() {
  return dashboardEngineMode() === 'native';
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function identifierQuery(value) {
  const numericId = Number(value);
  if (Number.isFinite(numericId) && String(value).trim() !== '') {
    return { legacyId: numericId };
  }

  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return { _id: value };
  }

  throw httpError(404, 'Projection not found');
}

async function findDashboardProjection(id) {
  const database = getDatabaseStatus();
  if (database !== 'connected') {
    throw httpError(503, 'Database unavailable');
  }

  const projection = await SavedProjection.findOne(identifierQuery(id)).lean();
  if (!projection) {
    throw httpError(404, 'Projection not found');
  }
  return projection;
}

async function nativeDashboardSummary(id) {
  return dashboardSummary(await findDashboardProjection(id));
}

async function nativeDashboardCharts(id) {
  return (await nativeDashboardSummary(id)).datasets;
}

module.exports = {
  dashboardEngineMode,
  nativeDashboardCharts,
  nativeDashboardSummary,
  useNativeDashboardEngine,
};
