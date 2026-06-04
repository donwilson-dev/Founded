const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Debt = require('../models/Debt');

async function listDebts(_req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const debts = await Debt.find().sort({ priority_number: 1, legacyId: 1 }).lean();
    res.json(debts);
  } catch (error) {
    next(error);
  }
}

async function getDebt(req, res, next) {
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
        message: 'Debt not found',
      });
      return;
    }

    const query = isLegacyId ? { legacyId: Number(id) } : { _id: id };
    const debt = await Debt.findOne(query).lean();

    if (!debt) {
      res.status(404).json({
        status: 'not-found',
        message: 'Debt not found',
      });
      return;
    }

    res.json(debt);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDebt,
  listDebts,
};
