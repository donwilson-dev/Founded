const mongoose = require('mongoose');

const debtTypes = ['credit_card', 'personal_loan', 'vehicle_loan', 'student_loan', 'other'];
const debtRecurrences = ['one_time', 'weekly', 'bi_weekly', 'first_and_fifteenth', 'monthly', 'yearly'];

const debtSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    account_balance_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    legacy_account_balance_id: { type: Number },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    debt_type: { type: String, required: true, enum: debtTypes },
    starting_balance: { type: Number, required: true, min: 0 },
    current_balance: { type: Number, required: true, min: 0 },
    minimum_monthly_payment: { type: Number, required: true, min: 0 },
    planned_extra_payment: { type: Number, default: 0, min: 0 },
    recurrence: { type: String, enum: debtRecurrences },
    payment_due_day: { type: Number, min: 1, max: 31 },
    payment_date: { type: String },
    start_date: { type: String, required: true },
    payoff_target_date: { type: String },
    target_payoff_active: { type: Boolean, default: false },
    priority_number: { type: Number, min: 1 },
    active: { type: Boolean, default: true },
    notes: { type: String },
  },
  {
    collection: 'debts',
  },
);

debtSchema.index({ active: 1, priority_number: 1 });
debtSchema.index({ account_balance_id: 1 });

module.exports = mongoose.model('Debt', debtSchema);
