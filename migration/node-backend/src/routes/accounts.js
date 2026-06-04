const express = require('express');
const { getAccount, listAccounts } = require('../controllers/AccountController');

const router = express.Router();

router.get('/', listAccounts);
router.get('/:id', getAccount);

module.exports = router;
