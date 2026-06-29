const {
  nativeDashboardCharts,
  nativeDashboardSummary,
} = require('../services/dashboardEngineAdapter');

async function getDashboardSummary(req, res, next) {
  try {
    res.json(await nativeDashboardSummary(req.params.id));
  } catch (error) {
    next(error);
  }
}

async function getDashboardCharts(req, res, next) {
  try {
    res.json(await nativeDashboardCharts(req.params.id));
  } catch (error) {
    next(error);
  }
}

function dashboardPlaceholder(_req, res) {
  res.status(501).json({
    status: 'not-implemented',
    phase: 'phase-6-contract-scaffold',
  });
}

module.exports = {
  dashboardPlaceholder,
  getDashboardCharts,
  getDashboardSummary,
};
