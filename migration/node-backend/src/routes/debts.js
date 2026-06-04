const express = require('express');
const { getDebt, listDebts } = require('../controllers/DebtController');

const router = express.Router();

router.get('/', listDebts);
router.get('/:id', getDebt);

module.exports = router;
