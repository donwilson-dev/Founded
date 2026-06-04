const express = require('express');
const { incomePlaceholder } = require('../controllers/IncomeController');

const router = express.Router();

router.all('*', incomePlaceholder);

module.exports = router;
