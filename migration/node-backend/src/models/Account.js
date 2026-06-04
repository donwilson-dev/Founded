const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    owner: { type: String, trim: true, maxlength: 120 },
    account_type: { type: String, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true },
    notes: { type: String },
    active: { type: Boolean, default: true },
  },
  {
    collection: 'accountBalances',
  },
);

accountSchema.index({ active: 1, owner: 1 });

module.exports = mongoose.model('Account', accountSchema);
