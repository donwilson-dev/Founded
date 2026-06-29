const express = require('express');
const { createAccount, deleteAccount, getAccount, listAccounts, updateAccount } = require('../controllers/AccountController');

const router = express.Router();

router.get('/', listAccounts);
router.post('/', createAccount);
router.get('/:id', getAccount);
router.patch('/:id', updateAccount);
router.delete('/:id', deleteAccount);

module.exports = router;
