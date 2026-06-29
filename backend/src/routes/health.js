const express = require('express');
const { getDatabaseStatus } = require('../config/database');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'founded-backend',
    database: getDatabaseStatus(),
  });
});

module.exports = router;
