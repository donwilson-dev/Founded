const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const InterestRate = require('../models/InterestRate');

async function listInterestRatesForDebt(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const { debtId } = req.params;
    const isLegacyId = Number.isFinite(Number(debtId));

    if (!isLegacyId && !mongoose.Types.ObjectId.isValid(debtId)) {
      res.json([]);
      return;
    }

    const query = isLegacyId ? { legacy_debt_id: Number(debtId) } : { debt_id: debtId };
    const interestRates = await InterestRate.find(query).sort({ start_date: 1 }).lean();
    res.json(interestRates);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listInterestRatesForDebt,
};
