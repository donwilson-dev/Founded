const express = require('express');
const {
  deleteProjection,
  generateAndSaveBaselineProjection,
  generateBaselineProjection,
  getProjection,
  listProjections,
  saveProjection,
} = require('../controllers/ProjectionController');

const router = express.Router();

router.get('/', listProjections);
router.post('/', saveProjection);
router.post('/baseline/generate', generateBaselineProjection);
router.post('/baseline/generate-and-save', generateAndSaveBaselineProjection);
router.get('/:id', getProjection);
router.delete('/:id', deleteProjection);

module.exports = router;
