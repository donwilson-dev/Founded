const express = require('express');
const { projectionPlaceholder } = require('../controllers/ProjectionController');

const router = express.Router();

router.all('*', projectionPlaceholder);

module.exports = router;
