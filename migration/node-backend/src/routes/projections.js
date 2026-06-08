const express = require('express');
const {
  deleteProjection,
  getProjection,
  listProjections,
  saveProjection,
} = require('../controllers/ProjectionController');

const router = express.Router();

router.get('/', listProjections);
router.post('/', saveProjection);
router.get('/:id', getProjection);
router.delete('/:id', deleteProjection);

module.exports = router;
