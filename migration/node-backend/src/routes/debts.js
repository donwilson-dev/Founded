const express = require('express');
const { debtPlaceholder } = require('../controllers/DebtController');

const router = express.Router();

router.all('*', debtPlaceholder);

module.exports = router;
