const mongoose = require('mongoose');

const { getDatabaseStatus } = require('../config/database');
const SavedProjection = require('../models/SavedProjection');
const { forwardFastApiResponse } = require('../services/calculationBridge');
const {
  findByIdentifier,
  nextLegacyId,
  savedProjectionPayload,
} = require('../services/writeValidation');

function nowIso() {
  return new Date().toISOString();
}

async function generateBaselineProjection(req, res, next) {
  try {
    await forwardFastApiResponse(res, {
      method: 'POST',
      path: '/projections/baseline/generate',
      body: req.body,
    });
  } catch (error) {
    next(error);
  }
}

async function generateAndSaveBaselineProjection(req, res, next) {
  try {
    await forwardFastApiResponse(res, {
      method: 'POST',
      path: '/projections/baseline/generate-and-save',
      query: req.query,
      body: req.body,
    });
  } catch (error) {
    next(error);
  }
}

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

async function saveProjection(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const payload = savedProjectionPayload(req.body);
    const timestamp = nowIso();
    const projection = await SavedProjection.findOne({
      title: payload.title,
      projection_type: payload.projection_type,
    });

    if (projection) {
      projection.set({
        notes: payload.notes,
        assumptions_snapshot: payload.assumptions_snapshot,
        generated_rows: payload.generated_rows,
        updated_at: timestamp,
      });
      await projection.save();
      res.json(projection.toObject());
      return;
    }

    const created = new SavedProjection({
      legacyId: await nextLegacyId(SavedProjection),
      ...payload,
      created_at: timestamp,
      updated_at: timestamp,
    });
    await created.save();
    res.json(created.toObject());
  } catch (error) {
    next(error);
  }
}

async function deleteProjection(req, res, next) {
  const database = getDatabaseStatus();

  if (database !== 'connected') {
    res.status(503).json({
      status: 'database-unavailable',
      database,
    });
    return;
  }

  try {
    const projection = await findByIdentifier(SavedProjection, req.params.id, 'Projection');
    if (!projection) {
      res.status(404).json({
        status: 'not-found',
        message: 'Projection not found',
      });
      return;
    }

    await projection.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deleteProjection,
  generateAndSaveBaselineProjection,
  generateBaselineProjection,
  getProjection,
  listProjections,
  saveProjection,
};
