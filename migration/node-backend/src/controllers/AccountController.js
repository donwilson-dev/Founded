const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const Account = require('../models/Account');

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

module.exports = {
  getAccount,
  listAccounts,
};
