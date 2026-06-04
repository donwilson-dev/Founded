const mongoose = require('mongoose');

const incomeFrequencies = ['one_time', 'weekly', 'bi_weekly', 'first_and_fifteenth', 'monthly'];

const incomeSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    account_balance_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    legacy_account_balance_id: { type: Number },
    is_account_transfer: { type: Boolean, default: false },
    from_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    legacy_from_account_id: { type: Number },
    to_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    legacy_to_account_id: { type: Number },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0 },
    start_date: { type: String, required: true },
    end_date: { type: String },
    frequency: { type: String, enum: incomeFrequencies, default: 'monthly' },
    notes: { type: String },
    active: { type: Boolean, default: true },
  },
  {
    collection: 'incomeSources',
  },
);

incomeSchema.index({ active: 1, legacyId: 1 });
incomeSchema.index({ account_balance_id: 1 });
incomeSchema.index({ from_account_id: 1 });
incomeSchema.index({ to_account_id: 1 });

module.exports = mongoose.model('Income', incomeSchema);
