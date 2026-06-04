const mongoose = require('mongoose');

const interestRateSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    debt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Debt', required: true },
    legacy_debt_id: { type: Number },
    apr_percentage: { type: Number, required: true, min: 0 },
    start_date: { type: String, required: true },
    end_date: { type: String },
    notes: { type: String },
  },
  {
    collection: 'interestRates',
  },
);

interestRateSchema.index({ debt_id: 1, start_date: 1 });

module.exports = mongoose.model('InterestRate', interestRateSchema);
