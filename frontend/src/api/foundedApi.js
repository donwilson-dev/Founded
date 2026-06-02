const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
export const MAX_PROJECTION_MONTHS = 300;

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error('Unable to reach the Founded backend. Confirm FastAPI is running on port 8000.');
  }
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // Keep the HTTP status fallback for non-JSON responses.
    }
    throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(', ') : detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function post(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

function patch(path, body) {
  return request(path, { method: 'PATCH', body: JSON.stringify(body) });
}

function del(path) {
  return request(path, { method: 'DELETE' });
}

export const foundedApi = {
  baseUrl: API_BASE_URL,

  listAccountBalances: () => request('/account-balances'),
  createAccountBalance: (payload) => post('/account-balances', payload),
  updateAccountBalance: (id, payload) => patch(`/account-balances/${id}`, payload),
  deleteAccountBalance: (id) => del(`/account-balances/${id}`),

  listIncomeSources: () => request('/income-sources'),
  createIncomeSource: (payload) => post('/income-sources', payload),
  updateIncomeSource: (id, payload) => patch(`/income-sources/${id}`, payload),
  deleteIncomeSource: (id) => del(`/income-sources/${id}`),

  listDebts: () => request('/debts'),
  getDebt: (id) => request(`/debts/${id}`),
  createDebt: (payload) => post('/debts', payload),
  updateDebt: (id, payload) => patch(`/debts/${id}`, payload),
  deleteDebt: (id) => del(`/debts/${id}`),
  createInterestRate: (payload) => post('/interest-rates', payload),
  listInterestRates: (debtId) => request(`/interest-rates/debt/${debtId}`),
  updateInterestRate: (id, payload) => patch(`/interest-rates/${id}`, payload),
  deleteInterestRate: (id) => del(`/interest-rates/${id}`),

  deleteSavedProjection: (id) => del(`/projections/${id}`),

  generateBaselineProjection: ({
    startMonth,
    months,
    endMonth,
    accountBalanceIds = null,
    incomeSourceIds = null,
    debtIds = null,
  }) =>
    post('/projections/baseline/generate', {
      start_month: startMonth,
      months: endMonth ? null : Math.min(Number(months || 60), MAX_PROJECTION_MONTHS),
      end_month: endMonth || null,
      account_balance_ids: accountBalanceIds,
      income_source_ids: incomeSourceIds,
      debt_ids: debtIds,
    }),

  saveProjection: ({ title, projectionType, notes, assumptionsSnapshot, generatedRows }) =>
    post('/projections', {
      title,
      projection_type: projectionType,
      notes: notes || null,
      assumptions_snapshot: assumptionsSnapshot,
      generated_rows: generatedRows,
    }),

  listSavedProjections: () => request('/projections'),
  getSavedProjection: (id) => request(`/projections/${id}`),

  generateScenario: (payload) =>
    post('/scenario/generate', {
      baseline_projection_id: Number(payload.baselineProjectionId),
      scenario_start_month: payload.scenarioStartMonth || null,
      scenario_end_month: payload.scenarioEndMonth || null,
      months: payload.months ? Math.min(Number(payload.months), MAX_PROJECTION_MONTHS) : null,
      income_overrides: payload.incomeOverrides || [],
      debt_overrides: payload.debtOverrides || [],
      interest_rate_overrides: payload.interestRateOverrides || [],
    }),

  saveScenario: (payload) =>
    post('/scenario/save', {
      baseline_projection_id: Number(payload.baselineProjectionId),
      scenario_start_month: payload.scenarioStartMonth || null,
      scenario_end_month: payload.scenarioEndMonth || null,
      months: payload.months ? Math.min(Number(payload.months), MAX_PROJECTION_MONTHS) : null,
      income_overrides: payload.incomeOverrides || [],
      debt_overrides: payload.debtOverrides || [],
      interest_rate_overrides: payload.interestRateOverrides || [],
      title: payload.title || null,
      notes: payload.notes || null,
    }),

  getDashboardSummary: (projectionId) =>
    post(`/dashboard/${projectionId}/summary`, {}),

  getChartData: (projectionId) => request(`/dashboard/${projectionId}/charts`),

};

export function toIncomePayload(form, defaults = {}) {
  const frequency = form.frequency || defaults.frequency || 'monthly';
  const isAccountTransfer = Boolean(form.isAccountTransfer);
  return {
    account_balance_id: isAccountTransfer ? null : form.accountBalanceId ? Number(form.accountBalanceId) : null,
    is_account_transfer: isAccountTransfer,
    from_account_id: isAccountTransfer && form.fromAccountId ? Number(form.fromAccountId) : null,
    to_account_id: isAccountTransfer && form.toAccountId ? Number(form.toAccountId) : null,
    label: form.label,
    amount: Number(form.amount || 0),
    start_date: form.startDate || defaults.startDate,
    end_date: frequency === 'one_time' ? null : form.endDate || null,
    frequency,
    notes: form.notes || null,
    active: Boolean(form.active),
  };
}

export function toAccountBalancePayload(form) {
  return {
    name: form.name,
    owner: form.owner?.trim() || null,
    account_type: form.accountType?.trim() || null,
    amount: Number(form.amount || 0),
    date: form.date,
    notes: form.notes || null,
    active: Boolean(form.active),
  };
}

export function toDebtPayload(form, defaults = {}) {
  const isOtherDebt = form.debtType === 'other';
  const currentBalance = isOtherDebt ? 0 : Number(form.currentBalance || 0);
  const recurrence = isOtherDebt ? (form.recurrence || 'monthly') : null;
  const rawMinimumPayment = Number(form.minimumMonthlyPayment || 0);
  const rawActualPayment = form.actualPayment === '' || form.actualPayment === undefined
    ? rawMinimumPayment + Number(form.plannedExtraPayment || 0)
    : Number(form.actualPayment || 0);
  const minimumPayment = isOtherDebt && rawMinimumPayment <= 0 && rawActualPayment > 0 ? rawActualPayment : rawMinimumPayment;
  return {
    account_balance_id: form.accountBalanceId ? Number(form.accountBalanceId) : null,
    name: form.name,
    debt_type: form.debtType,
    starting_balance: Number(form.startingBalance || currentBalance),
    current_balance: currentBalance,
    minimum_monthly_payment: minimumPayment,
    planned_extra_payment: Math.max(rawActualPayment - minimumPayment, 0),
    recurrence,
    payment_due_day: null,
    payment_date: isOtherDebt ? null : form.paymentDate || null,
    start_date: form.startDate || defaults.startDate,
    payoff_target_date: isOtherDebt && recurrence === 'one_time' ? null : form.payoffTargetDate || null,
    priority_number: isOtherDebt ? null : form.priorityNumber ? Number(form.priorityNumber) : null,
    active: Boolean(form.active),
    notes: form.notes || null,
  };
}

export function toRatePayload(form, debtId) {
  if (form.aprPercentage === '' || form.aprPercentage === null || form.aprPercentage === undefined) return null;
  return {
    debt_id: Number(debtId),
    apr_percentage: Number(form.aprPercentage || 0),
    start_date: form.rateStartDate || form.startDate,
    end_date: form.rateEndDate || null,
    notes: form.rateNotes || null,
  };
}

export function toRegularRatePayload(form, debtId) {
  if (form.debtType === 'other') return null;
  if (form.aprPercentage === '' || form.aprPercentage === null || form.aprPercentage === undefined) return null;
  return {
    debt_id: Number(debtId),
    apr_percentage: Number(form.aprPercentage || 0),
    start_date: form.startDate,
    end_date: null,
    notes: 'Regular APR',
  };
}

export function toPromoRatePayload(form, debtId) {
  if (form.debtType === 'other') return null;
  if (form.promoAprPercentage === '' || form.promoAprPercentage === null || form.promoAprPercentage === undefined) return null;
  if (!form.promoStartDate || !form.promoEndDate) return null;
  return {
    debt_id: Number(debtId),
    apr_percentage: Number(form.promoAprPercentage || 0),
    start_date: form.promoStartDate,
    end_date: form.promoEndDate,
    notes: 'Promotional APR',
  };
}
