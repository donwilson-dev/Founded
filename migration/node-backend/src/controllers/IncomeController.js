const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Income = require('../models/Income');

async function listIncome(_req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const incomeSources = await Income.find().sort({ legacyId: 1 }).lean();
    res.json(incomeSources);
  } catch (error) {
    next(error);
  }
}

async function getIncome(req, res, next) {
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
        message: 'Income source not found',
      });
      return;
    }

    const query = isLegacyId ? { legacyId: Number(id) } : { _id: id };
    const incomeSource = await Income.findOne(query).lean();

    if (!incomeSource) {
      res.status(404).json({
        status: 'not-found',
        message: 'Income source not found',
      });
      return;
    }

    res.json(incomeSource);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getIncome,
  listIncome,
};
