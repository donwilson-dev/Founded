const express = require('express');
const { getScenario, listScenarios } = require('../controllers/ScenarioController');

const router = express.Router();

router.get('/', listScenarios);
router.get('/:id', getScenario);

module.exports = router;
