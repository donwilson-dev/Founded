const express = require('express');
const { generateScenario, saveScenario } = require('../controllers/ScenarioController');

const router = express.Router();

router.post('/generate', generateScenario);
router.post('/save', saveScenario);

module.exports = router;
