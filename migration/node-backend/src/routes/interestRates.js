const express = require('express');
const {
  createInterestRate,
  deleteInterestRate,
  listInterestRatesForDebt,
  updateInterestRate,
} = require('../controllers/InterestRateController');

const router = express.Router();

router.post('/', createInterestRate);
router.get('/debt/:debtId', listInterestRatesForDebt);
router.patch('/:id', updateInterestRate);
router.delete('/:id', deleteInterestRate);

module.exports = router;
