const mongoose = require('mongoose');

const scenarioSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    projection_type: { type: String, default: 'scenario', enum: ['scenario'] },
    notes: { type: String },
    assumptions_snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    generated_rows: { type: [mongoose.Schema.Types.Mixed], required: true, default: [] },
    created_at: { type: String },
    updated_at: { type: String },
  },
  {
    collection: 'savedProjections',
  },
);

scenarioSchema.index({ projection_type: 1, title: 1 }, { unique: true });
scenarioSchema.index({ updated_at: -1 });

module.exports = mongoose.model('Scenario', scenarioSchema);
