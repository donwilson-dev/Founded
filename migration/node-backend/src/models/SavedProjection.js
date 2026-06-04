const mongoose = require('mongoose');

const projectionTypes = ['baseline', 'scenario'];

const savedProjectionSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    projection_type: { type: String, required: true, enum: projectionTypes },
    notes: { type: String },
    assumptions_snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    generated_rows: { type: [mongoose.Schema.Types.Mixed], required: true, default: [] },
  },
  {
    collection: 'savedProjections',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

savedProjectionSchema.index({ projection_type: 1, title: 1 }, { unique: true });
savedProjectionSchema.index({ updated_at: -1 });

module.exports = mongoose.model('SavedProjection', savedProjectionSchema);
