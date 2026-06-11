const { forwardFastApiResponse } = require('../services/calculationBridge');
const {
  nativeDashboardCharts,
  nativeDashboardSummary,
  useNativeDashboardEngine,
} = require('../services/dashboardEngineAdapter');

async function getDashboardSummary(req, res, next) {
  try {
    if (useNativeDashboardEngine()) {
      res.json(await nativeDashboardSummary(req.params.id));
      return;
    }

    await forwardFastApiResponse(res, {
      method: 'POST',
      path: `/dashboard/${req.params.id}/summary`,
      body: req.body,
    });
  } catch (error) {
    next(error);
  }
}

async function getDashboardCharts(req, res, next) {
  try {
    if (useNativeDashboardEngine()) {
      res.json(await nativeDashboardCharts(req.params.id));
      return;
    }

    await forwardFastApiResponse(res, {
      method: 'GET',
      path: `/dashboard/${req.params.id}/charts`,
    });
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
