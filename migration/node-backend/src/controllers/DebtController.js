const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Debt = require('../models/Debt');
const InterestRate = require('../models/InterestRate');
const { debtPayload, findByIdentifier, httpError, nextLegacyId } = require('../services/writeValidation');

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

async function createDebt(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const legacyId = req.body.legacyId === undefined ? await nextLegacyId(Debt) : Number(req.body.legacyId);
    if (!Number.isInteger(legacyId) || legacyId <= 0) throw httpError(422, 'legacyId must be a positive integer.');
    if (await Debt.findOne({ legacyId }).lean()) throw httpError(422, 'legacyId already exists.');

    const debt = new Debt({
      legacyId,
      ...(await debtPayload(req.body)),
    });
    await debt.save();
    res.status(201).json(debt.toObject());
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

async function updateDebt(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const debt = await findByIdentifier(Debt, req.params.id, 'Debt');
    if (!debt) {
      res.status(404).json({
        status: 'not-found',
        message: 'Debt not found',
      });
      return;
    }

    debt.set(await debtPayload(req.body, debt));
    await debt.save();
    res.json(debt.toObject());
  } catch (error) {
    next(error);
  }
}

async function deleteDebt(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const debt = await findByIdentifier(Debt, req.params.id, 'Debt');
    if (!debt) {
      res.status(404).json({
        status: 'not-found',
        message: 'Debt not found',
      });
      return;
    }

    await InterestRate.deleteMany({ $or: [{ debt_id: debt._id }, { legacy_debt_id: debt.legacyId }] });
    await debt.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createDebt,
  deleteDebt,
  getDebt,
  listDebts,
  updateDebt,
};
