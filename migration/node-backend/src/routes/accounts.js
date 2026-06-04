const express = require('express');
const { accountPlaceholder } = require('../controllers/AccountController');

const router = express.Router();

router.all('*', accountPlaceholder);

module.exports = router;
