const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Income = require('../models/Income');
const { findByIdentifier, httpError, incomePayload, nextLegacyId } = require('../services/writeValidation');

function incomeResponse(income) {
  if (!income) return income;
  const plain = typeof income.toObject === 'function' ? income.toObject() : income;
  return {
    ...plain,
    id: plain.legacyId ?? String(plain._id),
    account_balance_id: plain.legacy_account_balance_id ?? plain.account_balance_id ?? null,
    from_account_id: plain.legacy_from_account_id ?? plain.from_account_id ?? null,
    to_account_id: plain.legacy_to_account_id ?? plain.to_account_id ?? null,
  };
}

function incomeListResponse(incomeSources) {
  return incomeSources.map((income) => incomeResponse(income));
}

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
    res.json(incomeListResponse(incomeSources));
  } catch (error) {
    next(error);
  }
}

async function createIncome(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const legacyId = req.body.legacyId === undefined ? await nextLegacyId(Income) : Number(req.body.legacyId);
    if (!Number.isInteger(legacyId) || legacyId <= 0) throw httpError(422, 'legacyId must be a positive integer.');
    if (await Income.findOne({ legacyId }).lean()) throw httpError(422, 'legacyId already exists.');

    const incomeSource = new Income({
      legacyId,
      ...(await incomePayload(req.body)),
    });
    await incomeSource.save();
    res.status(201).json(incomeResponse(incomeSource));
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

    res.json(incomeResponse(incomeSource));
  } catch (error) {
    next(error);
  }
}

async function updateIncome(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const incomeSource = await findByIdentifier(Income, req.params.id, 'Income source');
    if (!incomeSource) {
      res.status(404).json({
        status: 'not-found',
        message: 'Income source not found',
      });
      return;
    }

    incomeSource.set(await incomePayload(req.body, incomeSource));
    await incomeSource.save();
    res.json(incomeResponse(incomeSource));
  } catch (error) {
    next(error);
  }
}

async function deleteIncome(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const incomeSource = await findByIdentifier(Income, req.params.id, 'Income source');
    if (!incomeSource) {
      res.status(404).json({
        status: 'not-found',
        message: 'Income source not found',
      });
      return;
    }

    await incomeSource.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createIncome,
  deleteIncome,
  getIncome,
  incomeResponse,
  incomeListResponse,
  listIncome,
  updateIncome,
};
