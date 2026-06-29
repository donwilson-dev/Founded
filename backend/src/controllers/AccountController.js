const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Account = require('../models/Account');
const {
  accountPayload,
  ensureAccountCanBeDeleted,
  findByIdentifier,
  httpError,
  nextLegacyId,
} = require('../services/writeValidation');

async function listAccounts(_req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const accounts = await Account.find().sort({ date: -1, legacyId: -1 }).lean();
    res.json(accounts);
  } catch (error) {
    next(error);
  }
}

async function createAccount(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const legacyId = req.body.legacyId === undefined ? await nextLegacyId(Account) : Number(req.body.legacyId);
    if (!Number.isInteger(legacyId) || legacyId <= 0) throw httpError(422, 'legacyId must be a positive integer.');
    if (await Account.findOne({ legacyId }).lean()) throw httpError(422, 'legacyId already exists.');

    const account = new Account({
      legacyId,
      ...accountPayload(req.body, { requireAll: true }),
    });
    await account.save();
    res.status(201).json(account.toObject());
  } catch (error) {
    next(error);
  }
}

async function getAccount(req, res, next) {
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
        message: 'Account balance not found',
      });
      return;
    }

    const query = isLegacyId ? { legacyId: Number(id) } : { _id: id };
    const account = await Account.findOne(query).lean();

    if (!account) {
      res.status(404).json({
        status: 'not-found',
        message: 'Account balance not found',
      });
      return;
    }

    res.json(account);
  } catch (error) {
    next(error);
  }
}

async function updateAccount(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const account = await findByIdentifier(Account, req.params.id, 'Account balance');
    if (!account) {
      res.status(404).json({
        status: 'not-found',
        message: 'Account balance not found',
      });
      return;
    }

    account.set(accountPayload(req.body));
    await account.save();
    res.json(account.toObject());
  } catch (error) {
    next(error);
  }
}

async function deleteAccount(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const account = await findByIdentifier(Account, req.params.id, 'Account balance');
    if (!account) {
      res.status(404).json({
        status: 'not-found',
        message: 'Account balance not found',
      });
      return;
    }

    await ensureAccountCanBeDeleted(account);
    await account.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
};
