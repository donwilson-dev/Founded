const express = require('express');
const { getProjection, listProjections } = require('../controllers/ProjectionController');

const router = express.Router();

router.get('/', listProjections);
router.get('/:id', getProjection);

module.exports = router;
