const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'founded-node-backend',
    phase: 'phase-1-skeleton',
  });
});

module.exports = router;
