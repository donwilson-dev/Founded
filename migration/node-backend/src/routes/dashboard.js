const express = require('express');
const { dashboardPlaceholder } = require('../controllers/DashboardController');

const router = express.Router();

router.all('*', dashboardPlaceholder);

module.exports = router;
