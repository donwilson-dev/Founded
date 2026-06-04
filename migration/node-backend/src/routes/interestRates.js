const express = require('express');
const { interestRatePlaceholder } = require('../controllers/InterestRateController');

const router = express.Router();

router.all('*', interestRatePlaceholder);

module.exports = router;
