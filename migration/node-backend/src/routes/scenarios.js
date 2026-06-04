const express = require('express');
const { scenarioPlaceholder } = require('../controllers/ScenarioController');

const router = express.Router();

router.all('*', scenarioPlaceholder);

module.exports = router;
