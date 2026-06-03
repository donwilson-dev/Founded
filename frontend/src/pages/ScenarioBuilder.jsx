import React from 'react';
import { Edit3, GitCompare, GripVertical, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  foundedApi,
  toDebtPayload,
  toIncomePayload,
  toPromoRatePayload,
  toRegularRatePayload,
} from '../api/foundedApi.js';
import EmptyState from '../components/EmptyState.jsx';
import ProjectionTable from '../components/ProjectionTable.jsx';
import { currencyPrecise, labelize, percent, shortMonth } from '../utils/formatters.js';
import { EstimatedPaymentFields } from '../utils/paymentEstimates.jsx';
import { useSessionState } from '../utils/persistence.js';
import { TABLE_COLUMN_VIEWS, normalizeProjectionRows } from '../utils/tableHelpers.js';

const MAX_INCOME_DEVIATIONS = 10;
const MAX_DEBT_DEVIATIONS = 10;

const incomeTemplate = {
  label: '',
  accountBalanceId: '',
  isAccountTransfer: false,
  fromAccountId: '',
  toAccountId: '',
  amount: '',
  startDate: '',
  endDate: '',
  frequency: 'monthly',
  notes: '',
  active: true,
};
const debtTemplate = {
  name: '',
  accountBalanceId: '',
  debtType: 'credit_card',
  startingBalance: '',
  currentBalance: '',
  minimumMonthlyPayment: '',
  actualPayment: '',
  plannedExtraPayment: '',
  paymentDate: '',
  startDate: '',
  payoffTargetDate: '',
  priorityNumber: '',
  recurrence: 'monthly',
  notes: '',
  active: true,
  aprPercentage: '',
  promoAprPercentage: '',
  promoStartDate: '',
  promoEndDate: '',
};

export default function ScenarioBuilder({ isActive = false }) {
  const [saved, setSaved] = useState([]);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [baselineId, setBaselineId] = useSessionState('founded.scenario.baselineId', '');
  const [baseline, setBaseline] = useSessionState('founded.scenario.baseline', null);
  const [scenario, setScenario] = useSessionState('founded.scenario.generated', null);
  const [incomeOverrides, setIncomeOverrides] = useSessionState('founded.scenario.incomeOverrides', []);
  const [debtOverrides, setDebtOverrides] = useSessionState('founded.scenario.debtOverrides', []);
  const [incomeForm, setIncomeForm] = useSessionState('founded.scenario.incomeForm', incomeTemplate);
  const [debtForm, setDebtForm] = useSessionState('founded.scenario.debtForm', debtTemplate);
  const [selectedScenarioId, setSelectedScenarioId] = useSessionState('founded.scenario.selectedScenarioId', '');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingDeleteScenarioId, setPendingDeleteScenarioId] = useState(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);
  const [showDebtForm, setShowDebtForm] = useSessionState('founded.scenario.showDebtForm', false);
  const [showIncomeForm, setShowIncomeForm] = useSessionState('founded.scenario.showIncomeForm', false);
  const [editingDebtOverrideIndex, setEditingDebtOverrideIndex] = useState(null);
  const [editingIncomeOverrideIndex, setEditingIncomeOverrideIndex] = useState(null);
  const [debtAprError, setDebtAprError] = useState('');
  const [debtDateError, setDebtDateError] = useState('');
  const incomeFormRef = useRef(null);
  const debtFormRef = useRef(null);
  const normalizedScenarioRows = useMemo(() => normalizeProjectionRows(scenario?.generated_rows || []), [scenario]);
  const selectedSavedScenario = savedScenarios.find((item) => String(item.id) === String(selectedScenarioId));
  const selectedBaseline = saved.find((item) => String(item.id) === String(baselineId));
  const baselineReady = Boolean(baseline && selectedBaseline);
  const baselineAccounts = useMemo(
    () => baseline?.assumptions_snapshot?.account_balances || baseline?.assumptions_snapshot?.baseline_assumptions?.account_balances || [],
    [baseline]
  );
  const activeBaselineAccounts = useMemo(() => baselineAccounts.filter((item) => item.active !== false), [baselineAccounts]);

  function reorderIncomeOverrides(fromIndex, toIndex) {
    setIncomeOverrides((items) => reorderItems(items, fromIndex, toIndex));
  }

  function reorderDebtOverrides(fromIndex, toIndex) {
    setDebtOverrides((items) => reorderItems(items, fromIndex, toIndex));
  }

  function focusOpenedForm(ref) {
    window.setTimeout(() => {
      const form = ref.current;
      if (!form) return;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    }, 0);
  }

  function accountOptionsFor(selectedId) {
    const options = [...activeBaselineAccounts];
    const selected = baselineAccounts.find((account) => String(account.id) === String(selectedId));
    if (selected && !options.some((account) => String(account.id) === String(selected.id))) {
      options.push(selected);
    }
    return options;
  }

  function accountExists(accountId) {
    return baselineAccounts.some((account) => String(account.id) === String(accountId));
  }

  function validateAccountSelection(accountId, label = 'Account') {
    if (!accountId) return `${label} is required.`;
    if (!accountExists(accountId)) return `${label} is no longer available.`;
    return '';
  }

  function validateIncomeAccountSelection() {
    if (incomeForm.isAccountTransfer) {
      return validateAccountSelection(incomeForm.fromAccountId, 'From Account')
        || validateAccountSelection(incomeForm.toAccountId, 'To Account')
        || (String(incomeForm.fromAccountId) === String(incomeForm.toAccountId) ? 'From Account and To Account must be different.' : '');
    }
    return validateAccountSelection(incomeForm.accountBalanceId);
  }

  function startAddIncomeOverride() {
    if (incomeOverrides.length >= MAX_INCOME_DEVIATIONS) {
      setStatus('Maximum of 10 income deviations reached.');
      return;
    }
    setShowIncomeForm(true);
    focusOpenedForm(incomeFormRef);
  }

  function startAddDebtOverride() {
    if (debtOverrides.length >= MAX_DEBT_DEVIATIONS) {
      setStatus('Maximum of 10 debt deviations reached.');
      return;
    }
    setDebtDateError('');
    setShowDebtForm(true);
    focusOpenedForm(debtFormRef);
  }

  useEffect(() => {
    foundedApi
      .listSavedProjections()
      .then((items) => {
        setSaved(items.filter((item) => item.projection_type === 'baseline'));
      setSavedScenarios(items.filter((item) => item.projection_type === 'scenario'));
      })
      .catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    function refreshSavedBaselines() {
      foundedApi
        .listSavedProjections()
        .then((items) => {
          setSaved(items.filter((item) => item.projection_type === 'baseline'));
          setSavedScenarios(items.filter((item) => item.projection_type === 'scenario'));
        })
        .catch((error) => setStatus(error.message));
    }
    window.addEventListener('founded:saved-projections-changed', refreshSavedBaselines);
    return () => window.removeEventListener('founded:saved-projections-changed', refreshSavedBaselines);
  }, []);

  useEffect(() => {
    if (!status) return undefined;
    const timeout = window.setTimeout(() => setStatus(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    function openRequestedScenario(event) {
      const requestedId = event.detail?.scenarioId || window.sessionStorage.getItem('founded.scenario.openScenarioId');
      if (!requestedId) return;
      window.sessionStorage.removeItem('founded.scenario.openScenarioId');
      loadSavedScenario(requestedId);
    }
    window.addEventListener('founded:open-scenario', openRequestedScenario);
    const storedId = window.sessionStorage.getItem('founded.scenario.openScenarioId');
    if (storedId) openRequestedScenario({ detail: { scenarioId: storedId } });
    return () => window.removeEventListener('founded:open-scenario', openRequestedScenario);
  }, []);

  async function loadBaseline(id) {
    setBaselineId(id);
    setScenario(null);
    setSelectedScenarioId('');
    setPendingDeleteScenarioId(null);
    if (!id) {
      setBaseline(null);
      return;
    }
    setLoading(true);
    try {
      const opened = await foundedApi.getSavedProjection(id);
      setBaseline(opened);
    } catch (error) {
      setStatus(error.message);
      setBaseline(null);
    } finally {
      setLoading(false);
    }
  }

  function clearBaseline() {
    setBaselineId('');
    setBaseline(null);
    setScenario(null);
    setSelectedScenarioId('');
    setPendingDeleteScenarioId(null);
    setStatus('Baseline selection cleared.');
  }

  function addIncomeOverride(event) {
    event.preventDefault();
    if (!incomeForm.label.trim() || incomeForm.amount === '') {
      setStatus('Name and Changed Amount are required.');
      return;
    }
    const accountError = validateIncomeAccountSelection();
    if (accountError) {
      setStatus(accountError);
      return;
    }
    const nextIncome = toIncomePayload(incomeForm, { startDate: baselineStartMonth(baseline), frequency: 'monthly' });
    setIncomeOverrides((items) => {
      if (editingIncomeOverrideIndex === null) return [...items, nextIncome];
      return items.map((item, index) => (index === editingIncomeOverrideIndex ? nextIncome : item));
    });
    setIncomeForm(incomeTemplate);
    setEditingIncomeOverrideIndex(null);
    setShowIncomeForm(false);
    setScenario(null);
  }

  function addDebtOverride(event) {
    event.preventDefault();
    if (!debtForm.name.trim() || !debtForm.debtType || (!isOtherDebt(debtForm) && debtForm.currentBalance === '')) {
      setStatus(isOtherDebt(debtForm) ? 'Debt Name and Debt Type are required.' : 'Debt Name, Debt Type, and Balance are required.');
      return;
    }
    const accountError = validateAccountSelection(debtForm.accountBalanceId);
    if (accountError) {
      setStatus(accountError);
      return;
    }
    if (!isOtherDebt(debtForm) && !debtForm.paymentDate) {
      setDebtDateError('Payment Date is required.');
      setStatus('Payment Date is required.');
      return;
    }
    if (!isOtherDebt(debtForm) && !isValidApr(debtForm.aprPercentage)) {
      setDebtAprError('APR is required for this debt type.');
      setStatus('APR is required for this debt type.');
      return;
    }
    setDebtAprError('');
    const existingId = editingDebtOverrideIndex === null ? null : debtOverrides[editingDebtOverrideIndex]?.debt?.id;
    const temporaryId = existingId || Date.now();
    const debt = { ...toDebtPayload({ ...debtForm, startingBalance: debtForm.currentBalance }, { startDate: baselineStartMonth(baseline) }), id: temporaryId };
    const rates = [toRegularRatePayload(debtForm, temporaryId), toPromoRatePayload(debtForm, temporaryId)].filter(Boolean);
    setDebtOverrides((items) => {
      const next = { debt, rates };
      if (editingDebtOverrideIndex === null) return [...items, next];
      return items.map((item, index) => (index === editingDebtOverrideIndex ? next : item));
    });
    setDebtForm(debtTemplate);
    setDebtAprError('');
    setDebtDateError('');
    setEditingDebtOverrideIndex(null);
    setShowDebtForm(false);
    setScenario(null);
  }

  function startEditDebtOverride(item, index) {
    const rates = item.rates || (item.rate ? [item.rate] : []);
    const promo = rates.find((rate) => rate.end_date);
    const regular = rates.find((rate) => !rate.end_date) || rates.find((rate) => rate.id !== promo?.id);
    setEditingDebtOverrideIndex(index);
    setDebtForm({
      ...debtTemplate,
      name: item.debt.name || '',
      accountBalanceId: item.debt.account_balance_id ?? item.debt.accountBalanceId ?? '',
      debtType: item.debt.debt_type || 'credit_card',
      currentBalance: item.debt.current_balance ?? '',
      minimumMonthlyPayment: item.debt.minimum_monthly_payment ?? '',
      actualPayment: Number(item.debt.minimum_monthly_payment || 0) + Number(item.debt.planned_extra_payment || 0),
      paymentDate: item.debt.payment_date || item.debt.paymentDate || '',
      startDate: item.debt.start_date || '',
      payoffTargetDate: item.debt.payoff_target_date || '',
      priorityNumber: item.debt.priority_number ?? '',
      recurrence: item.debt.recurrence || 'monthly',
      notes: item.debt.notes || '',
      active: item.debt.active !== false,
      aprPercentage: regular?.apr_percentage ?? '',
      promoAprPercentage: promo?.apr_percentage ?? '',
      promoStartDate: promo?.start_date || '',
      promoEndDate: promo?.end_date || '',
    });
    setDebtAprError('');
    setDebtDateError('');
    setShowDebtForm(true);
  }

  function deleteDebtOverride(index) {
    setDebtOverrides((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setPendingDeleteRow(null);
    if (editingDebtOverrideIndex === index) {
      setEditingDebtOverrideIndex(null);
      setDebtForm(debtTemplate);
      setDebtAprError('');
      setDebtDateError('');
      setShowDebtForm(false);
    }
    setScenario(null);
  }

  function inlineUpdateIncomeOverrideAmount(index, value) {
    const amount = parseInlineAmount(value);
    if (amount === null) return;
    setIncomeOverrides((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, amount } : item
    )));
    setScenario(null);
    setStatus('Income deviation amount updated.');
  }

  function inlineUpdateDebtOverrideAmount(index, value) {
    const amount = parseInlineAmount(value);
    if (amount === null) return;
    setDebtOverrides((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const otherDebt = item.debt?.debt_type === 'other';
      const nextDebt = otherDebt
        ? {
          ...item.debt,
          minimum_monthly_payment: amount,
          planned_extra_payment: 0,
        }
        : {
          ...item.debt,
          current_balance: amount,
          starting_balance: amount,
        };
      return { ...item, debt: nextDebt };
    }));
    setScenario(null);
    setStatus('Debt deviation amount updated.');
  }

  function startEditIncomeOverride(item, index) {
    setEditingIncomeOverrideIndex(index);
    setIncomeForm({
      ...incomeTemplate,
      label: item.label || '',
      accountBalanceId: item.account_balance_id ?? item.accountBalanceId ?? '',
      isAccountTransfer: Boolean(item.is_account_transfer ?? item.isAccountTransfer),
      fromAccountId: item.from_account_id ?? item.fromAccountId ?? '',
      toAccountId: item.to_account_id ?? item.toAccountId ?? '',
      amount: item.amount ?? '',
      startDate: item.start_date || '',
      endDate: item.end_date || '',
      frequency: item.frequency || 'monthly',
      notes: item.notes || '',
      active: item.active !== false,
    });
    setShowIncomeForm(true);
  }

  function deleteIncomeOverride(index) {
    setIncomeOverrides((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setPendingDeleteRow(null);
    if (editingIncomeOverrideIndex === index) {
      setEditingIncomeOverrideIndex(null);
      setIncomeForm(incomeTemplate);
      setShowIncomeForm(false);
    }
    setScenario(null);
  }

  async function generateScenario() {
    setLoading(true);
    try {
      const generated = await foundedApi.generateScenario({
        baselineProjectionId: baselineId,
        incomeOverrides: withDisplayOrder(incomeOverrides),
        debtOverrides: withDisplayOrder(debtOverrides.map((item) => item.debt)),
        interestRateOverrides: debtOverrides.flatMap((item) => item.rates || (item.rate ? [item.rate] : [])).filter(Boolean),
      });
      setScenario(generated);
      setStatus('Scenario generated.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveScenario() {
    setLoading(true);
    try {
      const savedScenario = await foundedApi.saveScenario({
        baselineProjectionId: baselineId,
        incomeOverrides: withDisplayOrder(incomeOverrides),
        debtOverrides: withDisplayOrder(debtOverrides.map((item) => item.debt)),
        interestRateOverrides: debtOverrides.flatMap((item) => item.rates || (item.rate ? [item.rate] : [])).filter(Boolean),
        title: selectedSavedScenario?.title || defaultScenarioTitle(baseline),
        notes: null,
      });
      setSelectedScenarioId(String(savedScenario.id));
      setPendingDeleteScenarioId(null);
      setSavedScenarios((items) => [
        savedScenario,
        ...items.filter((item) => item.id !== savedScenario.id),
      ]);
      setStatus('Scenario saved.');
      window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteScenario(item) {
    if (!item) return;
    setLoading(true);
    try {
      await foundedApi.deleteSavedProjection(item.id);
      setSavedScenarios((items) => items.filter((scenarioItem) => scenarioItem.id !== item.id));
      window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
      if (String(selectedScenarioId) === String(item.id)) {
        setSelectedScenarioId('');
        setScenario(null);
      }
      setPendingDeleteScenarioId(null);
      setStatus('Saved scenario deleted.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSavedScenario(id) {
    setSelectedScenarioId(id);
    setPendingDeleteScenarioId(null);
    if (!id) {
      setScenario(null);
      return;
    }
    setLoading(true);
    try {
      const opened = await foundedApi.getSavedProjection(id);
      const assumptions = opened.assumptions_snapshot || {};
      const restoredOverrides = restoreScenarioOverrides(assumptions);
      setScenario({ projection_type: opened.projection_type, assumptions_snapshot: opened.assumptions_snapshot, generated_rows: opened.generated_rows });
      setIncomeOverrides(restoredOverrides.incomeOverrides);
      setDebtOverrides(restoredOverrides.debtOverrides);
      setShowIncomeForm(false);
      setShowDebtForm(false);
      setEditingIncomeOverrideIndex(null);
      setEditingDebtOverrideIndex(null);
      setIncomeForm(incomeTemplate);
      setDebtForm(debtTemplate);
      setDebtAprError('');
      if (assumptions.baseline_projection_id) {
        const baselineProjection = await foundedApi.getSavedProjection(assumptions.baseline_projection_id);
        setBaselineId(String(assumptions.baseline_projection_id));
        setBaseline(baselineProjection);
      }
      setStatus('Scenario loaded.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scenario-grid">
      <section className="card scenario-setup-card">
        <div className="scenario-baseline-inline">
          <div className="scenario-baseline-title">
            <h2>Load Baseline</h2>
            <GitCompare size={18} />
          </div>
          <div className="scenario-control-row">
            <label>
              Baseline Projection
              <select value={baselineId} onChange={(event) => loadBaseline(event.target.value)}>
                <option value="">Select a saved baseline</option>
                {saved.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {!saved.length ? <EmptyState compact title="No saved baselines" body="Save a baseline projection before building a scenario." /> : null}
      </section>

      <section className="card scenario-command-card">
        <div className="scenario-save-controls">
          <div className="scenario-load-control">
            <label>
              Load Scenario
              <select value={selectedScenarioId} onChange={(event) => loadSavedScenario(event.target.value)}>
                <option value="">Select a saved scenario</option>
                {savedScenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="header-delete-slot">
              {selectedScenarioId ? (
                String(pendingDeleteScenarioId) === String(selectedScenarioId) ? (
                  <>
                    <button
                      type="button"
                      className="mini-confirm-button"
                      onClick={() => deleteScenario(savedScenarios.find((item) => String(item.id) === String(selectedScenarioId)))}
                      disabled={loading}
                    >
                      Confirm
                    </button>
                    <button type="button" className="icon-button table-action" onClick={() => setPendingDeleteScenarioId(null)} aria-label="Cancel delete">
                      x
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="icon-button table-action danger-action"
                    onClick={() => setPendingDeleteScenarioId(selectedScenarioId)}
                    disabled={loading}
                    title="Delete selected scenario"
                    aria-label="Delete selected scenario"
                  >
                    <Trash2 size={15} />
                  </button>
                )
              ) : null}
            </div>
          </div>
          <button className="outline-button scenario-save-button" onClick={saveScenario} disabled={!scenario || loading || !baselineReady}>
            <Save size={16} /> Save
          </button>
          <button className="primary-button" disabled={!baselineReady || loading} onClick={generateScenario}>
            {loading ? 'Working...' : 'Generate Scenario'}
          </button>
          {baselineReady ? (
            <button type="button" className="ghost-button" onClick={clearBaseline} disabled={loading}>
              Clear Baseline
            </button>
          ) : null}
        </div>
      </section>

      <section className="card scenario-panel">
        <div className="card-header">
          <h2>Income Deviations</h2>
          <button className="outline-button" onClick={startAddIncomeOverride} disabled={showIncomeForm} title={incomeOverrides.length >= MAX_INCOME_DEVIATIONS ? 'Maximum of 10 income deviations reached.' : undefined}>
            <Plus size={16} /> Income Deviation
          </button>
        </div>
        <DeviationTable
          columns={['Name', 'Amount', 'Frequency', 'Start Date', 'End Date', 'Update', 'Status', 'Actions']}
          sectionId="income-deviations"
          onReorder={reorderIncomeOverrides}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={loading}
          rows={incomeOverrides.map((item, index) => ({
            id: `${item.label}-${index}`,
            cells: [
              item.label,
              currencyPrecise(item.amount),
              labelize(item.frequency || 'monthly'),
              shortMonth(item.start_date),
              item.end_date ? shortMonth(item.end_date) : '-',
              <InlineAmountInput
                key={`income-override-update-${index}`}
                ariaLabel={`Update ${item.label || 'income deviation'} amount`}
                value={item.amount}
                onCommit={(value) => inlineUpdateIncomeOverrideAmount(index, value)}
              />,
              item.active === false ? 'Inactive' : 'Active',
            ],
            onEdit: () => startEditIncomeOverride(item, index),
            onDelete: () => deleteIncomeOverride(index),
          }))}
          emptyText="No income deviations added yet."
        />
        {showIncomeForm ? (
          <form className="inline-form" ref={incomeFormRef} onSubmit={addIncomeOverride}>
            <div className="form-heading">
              <strong>{editingIncomeOverrideIndex === null ? 'Add Income Deviation' : 'Edit Income Deviation'}</strong>
              <button type="button" className="icon-button" onClick={() => {
                setShowIncomeForm(false);
                setEditingIncomeOverrideIndex(null);
                setIncomeForm(incomeTemplate);
              }} aria-label="Cancel income deviation">
                <X size={16} />
              </button>
            </div>
            <div className={`deviation-grid income-deviation-grid ${incomeForm.isAccountTransfer ? 'transfer-grid' : ''}`}>
              <label>Name<input placeholder="Income Source" value={incomeForm.label} onChange={(e) => setIncomeForm({ ...incomeForm, label: e.target.value })} required /></label>
              {incomeForm.isAccountTransfer ? (
                <>
                  <label>From Account
                    <select value={incomeForm.fromAccountId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, fromAccountId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(incomeForm.fromAccountId).map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>To Account
                    <select value={incomeForm.toAccountId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, toAccountId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(incomeForm.toAccountId).map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Changed Amount<input type="number" min="0" placeholder="0.00" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} required /></label>
                </>
              ) : (
                <>
                  <label>Account
                    <select value={incomeForm.accountBalanceId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, accountBalanceId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(incomeForm.accountBalanceId).map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Changed Amount<input type="number" min="0" placeholder="0.00" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} required /></label>
                </>
              )}
              <label>{isOneTimeIncome(incomeForm) ? 'Date' : 'Start Date'}<input type="date" value={incomeForm.startDate} onChange={(e) => setIncomeForm({ ...incomeForm, startDate: e.target.value })} /></label>
              {!isOneTimeIncome(incomeForm) ? (
                <label>End Date<input type="date" value={incomeForm.endDate} onChange={(e) => setIncomeForm({ ...incomeForm, endDate: e.target.value })} /></label>
              ) : null}
              <label>Recurring
                <select value={incomeForm.frequency} onChange={(e) => setIncomeForm({ ...incomeForm, frequency: e.target.value, endDate: e.target.value === 'one_time' ? '' : incomeForm.endDate })}>
                  <option value="one_time">One-Time</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi_weekly">Bi-weekly</option>
                  <option value="first_and_fifteenth">First and Fifteenth</option>
                </select>
              </label>
              <label className={incomeForm.isAccountTransfer ? 'wide-field income-notes-field' : 'wide-field income-notes-field'}>Notes<textarea placeholder="Optional notes" value={incomeForm.notes} onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })} /></label>
            </div>
            <div className="form-actions-row">
              <button className="primary-button">{editingIncomeOverrideIndex === null ? 'Save Income Change' : 'Update Income Change'}</button>
              <label className="checkbox-line">
                <input type="checkbox" checked={incomeForm.isAccountTransfer} onChange={(e) => setIncomeForm({ ...incomeForm, isAccountTransfer: e.target.checked, accountBalanceId: e.target.checked ? '' : incomeForm.accountBalanceId })} /> Account Transfer
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={incomeForm.active} onChange={(e) => setIncomeForm({ ...incomeForm, active: e.target.checked })} /> Active
              </label>
            </div>
          </form>
        ) : null}
      </section>

      <section className="card scenario-panel">
        <div className="card-header">
          <h2>Debt Deviations</h2>
          <button className="outline-button" onClick={startAddDebtOverride} disabled={showDebtForm} title={debtOverrides.length >= MAX_DEBT_DEVIATIONS ? 'Maximum of 10 debt deviations reached.' : undefined}>
            <Plus size={16} /> Debt Deviation
          </button>
        </div>
        <DeviationTable
          columns={['Debt Name', 'Type', 'Balance', 'Min Pay', 'Actual Payment', 'APR', 'Status', 'Update', 'Actions']}
          sectionId="debt-deviations"
          onReorder={reorderDebtOverrides}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={loading}
          rows={debtOverrides.map((item, index) => ({
            id: item.debt.id || index,
            cells: [
              item.debt.name,
              labelize(item.debt.debt_type),
              currencyPrecise(item.debt.current_balance),
              currencyPrecise(item.debt.minimum_monthly_payment),
              currencyPrecise(Number(item.debt.minimum_monthly_payment || 0) + Number(item.debt.planned_extra_payment || 0)),
              item.debt.debt_type === 'other' ? labelize(item.debt.recurrence || 'monthly') : primaryApr(item),
              item.debt.active === false ? 'Inactive' : 'Active',
              <InlineAmountInput
                key={`debt-override-update-${index}`}
                ariaLabel={`Update ${item.debt.name || 'debt deviation'} amount`}
                value={item.debt.debt_type === 'other' ? Number(item.debt.minimum_monthly_payment || 0) + Number(item.debt.planned_extra_payment || 0) : item.debt.current_balance}
                onCommit={(value) => inlineUpdateDebtOverrideAmount(index, value)}
              />,
            ],
            onEdit: () => startEditDebtOverride(item, index),
            onDelete: () => deleteDebtOverride(index),
          }))}
          emptyText="No debt deviations added yet."
        />
        {showDebtForm ? (
          <form className="inline-form debt-form" ref={debtFormRef} onSubmit={addDebtOverride}>
            <div className="form-heading">
              <strong>{editingDebtOverrideIndex === null ? 'Add Debt Deviation' : 'Edit Debt Deviation'}</strong>
              <button type="button" className="icon-button" onClick={() => {
                setShowDebtForm(false);
                setEditingDebtOverrideIndex(null);
                setDebtForm(debtTemplate);
                setDebtAprError('');
                setDebtDateError('');
              }} aria-label="Cancel debt deviation">
                <X size={16} />
              </button>
            </div>
            <div className="debt-form-columns">
              <div className="form-column">
                <label>Debt Name<input placeholder="Debt" value={debtForm.name} onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })} required /></label>
                <label>Debt Type
                  <select value={debtForm.debtType} onChange={(e) => {
                    const nextForm = normalizeDebtFormForType({ ...debtForm, debtType: e.target.value });
                    setDebtForm(nextForm);
                    if (isOtherDebt(nextForm) || isValidApr(nextForm.aprPercentage)) setDebtAprError('');
                    if (isOtherDebt(nextForm) || nextForm.paymentDate) setDebtDateError('');
                  }}>
                    {['credit_card', 'personal_loan', 'vehicle_loan', 'student_loan', 'other'].map((type) => (
                      <option key={type} value={type}>
                        {labelize(type)}
                      </option>
                    ))}
                  </select>
                </label>
                {!isOtherDebt(debtForm) ? (
                  <label>Balance<input type="number" min="0" placeholder="0.00" value={debtForm.currentBalance} onChange={(e) => setDebtForm({ ...debtForm, currentBalance: e.target.value })} required /></label>
                ) : null}
                <label>Minimum Payment<input type="number" min="0" placeholder="0.00" value={debtForm.minimumMonthlyPayment} onChange={(e) => setDebtForm({ ...debtForm, minimumMonthlyPayment: e.target.value })} /></label>
                <label>Actual Payment<input type="number" min="0" placeholder="0.00" value={debtForm.actualPayment} onChange={(e) => setDebtForm({ ...debtForm, actualPayment: e.target.value })} /></label>
              </div>
              {!isOtherDebt(debtForm) ? (
                <div className="form-column">
                  <label>Account
                    <select value={debtForm.accountBalanceId || ''} onChange={(e) => setDebtForm({ ...debtForm, accountBalanceId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(debtForm.accountBalanceId).map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Standard APR %<input type="number" min="0" step="0.01" placeholder="0.00" value={debtForm.aprPercentage} onChange={(e) => {
                    setDebtForm({ ...debtForm, aprPercentage: e.target.value });
                    if (isValidApr(e.target.value)) setDebtAprError('');
                  }} /></label>
                  {debtAprError ? <p className="field-error">APR is required for this debt type.</p> : null}
                  <label>Promo APR %<input type="number" min="0" step="0.01" placeholder="Optional" value={debtForm.promoAprPercentage} onChange={(e) => setDebtForm({ ...debtForm, promoAprPercentage: e.target.value })} /></label>
                  <label>Promo Start Date<input type="date" value={debtForm.promoStartDate} onChange={(e) => setDebtForm({ ...debtForm, promoStartDate: e.target.value })} /></label>
                  <label>Promo End Date<input type="date" value={debtForm.promoEndDate} onChange={(e) => setDebtForm({ ...debtForm, promoEndDate: e.target.value })} /></label>
                </div>
              ) : (
                <div className="form-column">
                  <label>Account
                    <select value={debtForm.accountBalanceId || ''} onChange={(e) => setDebtForm({ ...debtForm, accountBalanceId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(debtForm.accountBalanceId).map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Recurring
                    <select value={debtForm.recurrence || 'monthly'} onChange={(e) => setDebtForm({ ...debtForm, recurrence: e.target.value, payoffTargetDate: e.target.value === 'one_time' ? '' : debtForm.payoffTargetDate })}>
                      <option value="one_time">One-Time</option>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="bi_weekly">Bi-Weekly</option>
                      <option value="first_and_fifteenth">First and Fifteenth</option>
                    </select>
                  </label>
                  <>
                    <label>{isOneTimeOtherDebt(debtForm) ? 'Date' : 'Start Date'}<input type="date" value={debtForm.startDate} onChange={(e) => setDebtForm({ ...debtForm, startDate: e.target.value })} /></label>
                    {!isOneTimeOtherDebt(debtForm) ? (
                      <label>End Date<input type="date" value={debtForm.payoffTargetDate} onChange={(e) => setDebtForm({ ...debtForm, payoffTargetDate: e.target.value })} /></label>
                    ) : null}
                  </>
                </div>
              )}
              <div className={`form-column ${isOtherDebt(debtForm) ? 'other-debt-notes-column' : 'debt-notes-column'}`}>
                {!isOtherDebt(debtForm) ? (
                  <>
                    <label>Payment Date<input type="date" value={debtForm.paymentDate} onChange={(e) => {
                      setDebtForm({ ...debtForm, paymentDate: e.target.value });
                      if (e.target.value) setDebtDateError('');
                    }} /></label>
                    {debtDateError ? <p className="field-error">Payment Date is required.</p> : null}
                  </>
                ) : null}
                <EstimatedPaymentFields form={debtForm} />
                <label>Notes<textarea placeholder="Optional notes" value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} /></label>
              </div>
            </div>
            <div className="form-actions-row">
              <button className="primary-button">{editingDebtOverrideIndex === null ? 'Save Debt Change' : 'Update Debt Change'}</button>
              <label className="checkbox-line">
                <input type="checkbox" checked={debtForm.active} onChange={(e) => setDebtForm({ ...debtForm, active: e.target.checked })} /> Active
              </label>
            </div>
            <p className="form-note">
              {isOtherDebt(debtForm)
                ? 'Other debts are treated as recurring general obligations without APR or promo interest.'
                : 'APR is optional. If left blank, projections assume 0%. Promo APR is ignored unless both promo dates are filled.'}
            </p>
          </form>
        ) : null}
      </section>

      {scenario ? (
        <ProjectionTable
          title="Side-by-Side Scenario Comparison"
          rows={normalizedScenarioRows}
          preferredColumns={TABLE_COLUMN_VIEWS.scenarioComparison.defaultColumns}
          initialVisibleCount={17}
          storageKey="founded.scenario.comparisonTable.v3"
        />
      ) : (
        <section className="card table-card">
          <EmptyState
            title="No scenario generated yet"
            body="Choose a saved baseline, add optional deviations, then generate a side-by-side scenario table."
          />
        </section>
      )}
      {status ? <div className="status-toast">{status}</div> : null}
    </div>
  );
}

function DeviationTable({
  columns,
  rows,
  emptyText,
  onReorder,
  sectionId,
  pendingDeleteRow = null,
  onRequestDelete,
  onCancelDelete,
  loading = false,
}) {
  if (!rows.length) return <p className="helper-text">{emptyText}</p>;
  const draggable = typeof onReorder === 'function' && rows.length > 1;
  const reorderType = 'application/x-founded-reorder';
  return (
    <div className="mini-table-wrap deviation-table-wrap">
      <table className={`mini-table deviation-table ${draggable ? 'reorderable-table' : ''}`}>
        <thead>
          <tr>
            {draggable ? <th className="drag-column" aria-label="Reorder rows" /> : null}
            {columns.map((column) => <th key={column} className={tableColumnClass(column)}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              draggable={draggable}
              onDragStart={(event) => {
                if (!draggable) return;
                activeScenarioDrag = { sectionId, rowId: row.id };
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(reorderType, JSON.stringify({ sectionId, rowId: row.id }));
                event.dataTransfer.setData('text/plain', JSON.stringify({ sectionId, rowId: row.id }));
                event.currentTarget.classList.add('dragging-row');
              }}
              onDragEnd={(event) => {
                activeScenarioDrag = null;
                event.currentTarget.classList.remove('dragging-row');
              }}
              onDragOver={(event) => {
                if (!draggable) return;
                const payload = activeScenarioDrag || parseReorderPayload(event.dataTransfer.getData('text/plain'));
                if (payload.sectionId !== sectionId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!draggable) return;
                const payload = activeScenarioDrag || parseReorderPayload(event.dataTransfer.getData(reorderType)) || parseReorderPayload(event.dataTransfer.getData('text/plain'));
                if (payload.sectionId !== sectionId) return;
                event.preventDefault();
                activeScenarioDrag = null;
                const fromIndex = rows.findIndex((item) => String(item.id) === String(payload.rowId));
                if (fromIndex < 0) return;
                onReorder(fromIndex, index);
              }}
            >
              {draggable ? (
                <td className="drag-cell">
                  <span className="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">
                    <GripVertical size={15} />
                  </span>
                </td>
              ) : null}
              {row.cells.map((cell, index) => <td key={index} className={tableCellClass(columns[index])}>{cell}</td>)}
              <td className="actions-column">
                <div className="row-actions">
                  {isPendingDelete(pendingDeleteRow, sectionId, row.id) ? (
                    <>
                      <button type="button" className="mini-confirm-button" onClick={row.onDelete} disabled={loading}>
                        Confirm
                      </button>
                      <button type="button" className="icon-button table-action" onClick={onCancelDelete} disabled={loading} aria-label="Cancel delete">
                        x
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="icon-button table-action" onClick={row.onEdit} title="Edit" aria-label="Edit deviation">
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button table-action danger-action"
                        onClick={() => onRequestDelete?.({ sectionId, id: row.id })}
                        title="Delete"
                        aria-label="Delete deviation"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

let activeScenarioDrag = null;

function tableColumnClass(column) {
  if (column === 'Actions') return 'actions-column';
  if (column === 'Update') return 'update-column update-column-header';
  return undefined;
}

function tableCellClass(column) {
  if (column === 'Update') return 'update-column update-column-cell';
  return undefined;
}

function isPendingDelete(pendingDeleteRow, sectionId, id) {
  return pendingDeleteRow?.sectionId === sectionId && String(pendingDeleteRow?.id) === String(id);
}

function InlineAmountInput({ value, onCommit, disabled = false, ariaLabel }) {
  const [draft, setDraft] = useState('');

  function commit() {
    if (draft.trim() === '') return;
    const parsed = parseInlineAmount(draft);
    if (parsed === null) {
      setDraft('');
      return;
    }
    onCommit(draft);
    setDraft('');
  }

  return (
    <input
      className="inline-update-input update-amount-input text-center"
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      placeholder="$0.00"
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (/^\d*(?:\.\d{0,2})?$/.test(nextValue)) setDraft(nextValue);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft('');
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function parseInlineAmount(value) {
  const text = String(value ?? '').trim();
  if (!text || !/^\d+(?:\.\d{0,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function reorderItems(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function parseReorderPayload(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function withDisplayOrder(items = []) {
  return items.map((item, index) => ({ ...item, display_order: index }));
}

function sortByDisplayOrder(items = []) {
  return [...items].sort((left, right) => {
    const leftOrder = left.display_order ?? left.displayOrder;
    const rightOrder = right.display_order ?? right.displayOrder;
    if (leftOrder === undefined && rightOrder === undefined) return 0;
    if (leftOrder === undefined) return 1;
    if (rightOrder === undefined) return -1;
    return Number(leftOrder) - Number(rightOrder);
  });
}

function baselineStartMonth(baseline) {
  return baseline?.generated_rows?.[0]?.month || new Date().toISOString().slice(0, 10);
}

function defaultScenarioTitle(baseline) {
  return baseline?.title ? `${baseline.title} Scenario` : 'Scenario';
}

function isOneTimeIncome(form) {
  return form.frequency === 'one_time';
}

function accountDisplayName(account) {
  if (!account) return '-';
  const bank = account.name || 'Account';
  const accountType = String(account.account_type || account.accountType || '').trim();
  const owner = String(account.owner || '').trim();
  if (accountType && owner) return `${bank} - ${accountType} (${owner})`;
  if (accountType) return `${bank} - ${accountType}`;
  if (owner) return `${bank} (${owner})`;
  return bank;
}

function isOtherDebt(formOrDebt) {
  return formOrDebt?.debtType === 'other' || formOrDebt?.debt_type === 'other';
}

function isValidApr(value) {
  if (value === '' || value === null || value === undefined) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function isOneTimeOtherDebt(formOrDebt) {
  return isOtherDebt(formOrDebt) && (formOrDebt?.recurrence || 'monthly') === 'one_time';
}

function normalizeDebtFormForType(form) {
  if (!isOtherDebt(form)) return form;
  return {
    ...form,
    startingBalance: '',
    currentBalance: '',
    recurrence: form.recurrence || 'monthly',
    priorityNumber: '',
    aprPercentage: '',
    promoAprPercentage: '',
    promoStartDate: '',
    promoEndDate: '',
  };
}

function overrideRates(item) {
  return item.rates || (item.rate ? [item.rate] : []);
}

function primaryApr(item) {
  const rates = overrideRates(item);
  const regular = rates.find((rate) => !rate.end_date) || rates[0];
  return regular ? percent(regular.apr_percentage) : '0%';
}

function restoreScenarioOverrides(assumptions = {}) {
  const explicit = assumptions.scenario_overrides || {};
  if (explicit.income_overrides || explicit.debt_overrides || explicit.interest_rate_overrides) {
    return {
      incomeOverrides: sortByDisplayOrder(explicit.income_overrides || []),
      debtOverrides: buildDebtOverrideRows(sortByDisplayOrder(explicit.debt_overrides || []), explicit.interest_rate_overrides || []),
    };
  }

  const baseline = assumptions.baseline_assumptions || {};
  const baselineIncome = baseline.income_sources || [];
  const scenarioIncome = assumptions.income_sources || [];
  const baselineDebts = baseline.debts || [];
  const scenarioDebts = assumptions.debts || [];
  const baselineRates = baseline.interest_rates || [];
  const scenarioRates = assumptions.interest_rates || [];

  const incomeOverrides = sortByDisplayOrder(scenarioIncome).filter((item) => {
    const baselineItem = baselineIncome.find((candidate) => identityMatches(candidate, item, 'label'));
    return !baselineItem || comparableIncome(baselineItem) !== comparableIncome(item);
  });

  const debtOverrides = sortByDisplayOrder(scenarioDebts)
    .filter((item) => {
      const baselineItem = baselineDebts.find((candidate) => identityMatches(candidate, item, 'name'));
      const debtChanged = !baselineItem || comparableDebt(baselineItem) !== comparableDebt(item);
      const baselineDebtRates = baselineRates.filter((rate) => sameId(rate.debt_id, item.id));
      const scenarioDebtRates = scenarioRates.filter((rate) => sameId(rate.debt_id, item.id));
      return debtChanged || comparableRates(baselineDebtRates) !== comparableRates(scenarioDebtRates);
    })
    .map((debt) => ({
      debt,
      rates: scenarioRates.filter((rate) => sameId(rate.debt_id, debt.id)),
    }));

  return { incomeOverrides, debtOverrides };
}

function buildDebtOverrideRows(debts = [], rates = []) {
  return debts.map((debt) => ({
    debt,
    rates: rates.filter((rate) => sameId(rate.debt_id, debt.id)),
  }));
}

function identityMatches(left, right, naturalKey) {
  if (left?.id !== undefined && right?.id !== undefined && left.id !== null && right.id !== null) {
    return sameId(left.id, right.id);
  }
  return left?.[naturalKey] && left[naturalKey] === right?.[naturalKey];
}

function sameId(left, right) {
  return String(left) === String(right);
}

function comparableIncome(item = {}) {
  return JSON.stringify({
    account_balance_id: item.account_balance_id || null,
    is_account_transfer: Boolean(item.is_account_transfer),
    from_account_id: item.from_account_id || null,
    to_account_id: item.to_account_id || null,
    label: item.label || '',
    amount: Number(item.amount || 0),
    start_date: item.start_date || '',
    end_date: item.end_date || null,
    frequency: item.frequency || 'monthly',
    notes: item.notes || null,
    active: item.active !== false,
  });
}

function comparableDebt(item = {}) {
  return JSON.stringify({
    account_balance_id: item.account_balance_id || null,
    name: item.name || '',
    debt_type: item.debt_type || '',
    current_balance: Number(item.current_balance || 0),
    minimum_monthly_payment: Number(item.minimum_monthly_payment || 0),
    planned_extra_payment: Number(item.planned_extra_payment || 0),
    recurrence: item.recurrence || null,
    payment_date: item.payment_date || null,
    start_date: item.start_date || '',
    payoff_target_date: item.payoff_target_date || null,
    priority_number: item.priority_number || null,
    active: item.active !== false,
    notes: item.notes || null,
  });
}

function comparableRates(rates = []) {
  return JSON.stringify(
    [...rates]
      .map((rate) => ({
        apr_percentage: Number(rate.apr_percentage || 0),
        start_date: rate.start_date || '',
        end_date: rate.end_date || null,
        notes: rate.notes || null,
      }))
      .sort((left, right) => `${left.start_date}-${left.end_date || ''}`.localeCompare(`${right.start_date}-${right.end_date || ''}`))
  );
}

export const scenarioInstructions = {
  title: 'Instructions',
  sections: [
    { heading: '1. Open Baseline', body: 'Choose a saved baseline projection. The original rows remain unchanged.' },
    { heading: '2. Add Deviations', body: 'Add changed income, changed debt payments, new debts, or APR changes.' },
    { heading: '3. Generate', body: 'Scenario values appear beside baseline values with + column names.' },
    { heading: '4. Save', body: 'Save the scenario as a separate projection for dashboard comparison.' },
  ],
  tips: ['Purple-tinted columns are scenario values.', 'Use deviation start dates for mid-plan changes.', 'Scenarios do not overwrite baselines.'],
};
