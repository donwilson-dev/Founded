const express = require('express');
const { listInterestRatesForDebt } = require('../controllers/InterestRateController');

const router = express.Router();

router.get('/debt/:debtId', listInterestRatesForDebt);

module.exports = router;
