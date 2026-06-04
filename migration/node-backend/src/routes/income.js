const express = require('express');
const { getIncome, listIncome } = require('../controllers/IncomeController');

const router = express.Router();

router.get('/', listIncome);
router.get('/:id', getIncome);

module.exports = router;
