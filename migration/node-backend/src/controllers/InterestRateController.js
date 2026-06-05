const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const InterestRate = require('../models/InterestRate');
const {
  findByIdentifier,
  httpError,
  interestRatePayload,
  nextLegacyId,
} = require('../services/writeValidation');

async function createInterestRate(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const legacyId = req.body.legacyId === undefined ? await nextLegacyId(InterestRate) : Number(req.body.legacyId);
    if (!Number.isInteger(legacyId) || legacyId <= 0) throw httpError(422, 'legacyId must be a positive integer.');
    if (await InterestRate.findOne({ legacyId }).lean()) throw httpError(422, 'legacyId already exists.');

    const interestRate = new InterestRate({
      legacyId,
      ...(await interestRatePayload(req.body)),
    });
    await interestRate.save();
    res.status(201).json(interestRate.toObject());
  } catch (error) {
    next(error);
  }
}

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

async function updateInterestRate(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const interestRate = await findByIdentifier(InterestRate, req.params.id, 'Interest rate');
    if (!interestRate) {
      res.status(404).json({
        status: 'not-found',
        message: 'Interest rate not found',
      });
      return;
    }

    interestRate.set(await interestRatePayload(req.body, interestRate));
    await interestRate.save();
    res.json(interestRate.toObject());
  } catch (error) {
    next(error);
  }
}

async function deleteInterestRate(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const interestRate = await findByIdentifier(InterestRate, req.params.id, 'Interest rate');
    if (!interestRate) {
      res.status(404).json({
        status: 'not-found',
        message: 'Interest rate not found',
      });
      return;
    }

    await interestRate.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInterestRate,
  deleteInterestRate,
  listInterestRatesForDebt,
  updateInterestRate,
};
