const express = require('express');
const { createDebt, deleteDebt, getDebt, listDebts, updateDebt } = require('../controllers/DebtController');

const router = express.Router();

router.get('/', listDebts);
router.post('/', createDebt);
router.get('/:id', getDebt);
router.patch('/:id', updateDebt);
router.delete('/:id', deleteDebt);

module.exports = router;
