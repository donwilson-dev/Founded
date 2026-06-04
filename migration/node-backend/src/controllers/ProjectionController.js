const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const SavedProjection = require('../models/SavedProjection');

async function listProjections(_req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const projections = await SavedProjection.find().sort({ updated_at: -1, legacyId: -1 }).lean();
    res.json(projections);
  } catch (error) {
    next(error);
  }
}

async function getProjection(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const { id } = req.params;
    const isLegacyId = Number.isFinite(Number(id));

    if (!isLegacyId && !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({
        status: 'not-found',
        message: 'Saved projection not found',
      });
      return;
    }

    const query = isLegacyId ? { legacyId: Number(id) } : { _id: id };
    const projection = await SavedProjection.findOne(query).lean();

    if (!projection) {
      res.status(404).json({
        status: 'not-found',
        message: 'Saved projection not found',
      });
      return;
    }

    res.json(projection);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProjection,
  listProjections,
};
