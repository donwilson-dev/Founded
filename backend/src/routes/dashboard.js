const express = require('express');
const {
  dashboardPlaceholder,
  getDashboardCharts,
  getDashboardSummary,
} = require('../controllers/DashboardController');

const router = express.Router();

router.post('/:id/summary', getDashboardSummary);
router.get('/:id/charts', getDashboardCharts);
router.all('*', dashboardPlaceholder);

module.exports = router;
