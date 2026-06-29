const express = require('express');
const { createIncome, deleteIncome, getIncome, listIncome, updateIncome } = require('../controllers/IncomeController');

const router = express.Router();

router.get('/', listIncome);
router.post('/', createIncome);
router.get('/:id', getIncome);
router.patch('/:id', updateIncome);
router.delete('/:id', deleteIncome);

module.exports = router;
