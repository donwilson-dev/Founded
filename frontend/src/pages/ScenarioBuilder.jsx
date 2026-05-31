import React from 'react';
import { Edit3, GitCompare, Plus, Save, Trash2, X } from 'lucide-react';
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
  const [showDebtForm, setShowDebtForm] = useSessionState('founded.scenario.showDebtForm', false);
  const [showIncomeForm, setShowIncomeForm] = useSessionState('founded.scenario.showIncomeForm', false);
  const [editingDebtOverrideIndex, setEditingDebtOverrideIndex] = useState(null);
  const [editingIncomeOverrideIndex, setEditingIncomeOverrideIndex] = useState(null);
  const [debtAprError, setDebtAprError] = useState('');
  const incomeFormRef = useRef(null);
  const debtFormRef = useRef(null);
  const normalizedScenarioRows = useMemo(() => normalizeProjectionRows(scenario?.generated_rows || []), [scenario]);
  const selectedSavedScenario = savedScenarios.find((item) => String(item.id) === String(selectedScenarioId));
  const selectedBaseline = saved.find((item) => String(item.id) === String(baselineId));
  const baselineReady = Boolean(baseline && selectedBaseline);
  const baselineAccounts = useMemo(
    () => (baseline?.assumptions_snapshot?.account_balances || baseline?.assumptions_snapshot?.baseline_assumptions?.account_balances || []).filter((item) => item.active !== false),
    [baseline]
  );

  function focusOpenedForm(ref) {
    window.setTimeout(() => {
      const form = ref.current;
      if (!form) return;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    }, 0);
  }

  function startAddIncomeOverride() {
    setShowIncomeForm(true);
    focusOpenedForm(incomeFormRef);
  }

  function startAddDebtOverride() {
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
    setShowDebtForm(true);
  }

  function deleteDebtOverride(index) {
    setDebtOverrides((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (editingDebtOverrideIndex === index) {
      setEditingDebtOverrideIndex(null);
      setDebtForm(debtTemplate);
      setDebtAprError('');
      setShowDebtForm(false);
    }
    setScenario(null);
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
        incomeOverrides,
        debtOverrides: debtOverrides.map((item) => item.debt),
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
        incomeOverrides,
        debtOverrides: debtOverrides.map((item) => item.debt),
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
          <button className="outline-button" onClick={startAddIncomeOverride} disabled={showIncomeForm}>
            <Plus size={16} /> Income Deviation
          </button>
        </div>
        <DeviationTable
          columns={['Name', 'Amount', 'Frequency', 'Start Date', 'End Date', 'Status', 'Actions']}
          rows={incomeOverrides.map((item, index) => ({
            id: `${item.label}-${index}`,
            cells: [
              item.label,
              currencyPrecise(item.amount),
              labelize(item.frequency || 'monthly'),
              shortMonth(item.start_date),
              item.end_date ? shortMonth(item.end_date) : '-',
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
                      <option value="">Unassigned</option>
                      {baselineAccounts.map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>To Account
                    <select value={incomeForm.toAccountId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, toAccountId: e.target.value })}>
                      <option value="">Unassigned</option>
                      {baselineAccounts.map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Changed Amount<input type="number" min="0" placeholder="0.00" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} required /></label>
                </>
              ) : (
                <>
                  <label>Account
                    <select value={incomeForm.accountBalanceId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, accountBalanceId: e.target.value })}>
                      <option value="">Unassigned</option>
                      {baselineAccounts.map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
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
          <button className="outline-button" onClick={startAddDebtOverride} disabled={showDebtForm}>
            <Plus size={16} /> Debt Deviation
          </button>
        </div>
        <DeviationTable
          columns={['Debt Name', 'Type', 'Balance', 'Min. Payment', 'Actual Payment', 'APR', 'Status', 'Actions']}
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
                      <option value="">Unassigned</option>
                      {baselineAccounts.map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
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
                      <option value="">Unassigned</option>
                      {baselineAccounts.map((account) => <option key={account.id} value={account.id}>{accountDisplayName(account)}</option>)}
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
              {!isOtherDebt(debtForm) ? (
                <div className="form-column debt-notes-column">
                  <EstimatedPaymentFields form={debtForm} />
                  <label>Notes<textarea placeholder="Optional notes" value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} /></label>
                </div>
              ) : (
                <div className="form-column other-debt-notes-column">
                  <label>Notes<textarea placeholder="Optional notes" value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} /></label>
                </div>
              )}
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

function DeviationTable({ columns, rows, emptyText }) {
  if (!rows.length) return <p className="helper-text">{emptyText}</p>;
  return (
    <div className="mini-table-wrap deviation-table-wrap">
      <table className="mini-table deviation-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => <td key={index}>{cell}</td>)}
              <td>
                <div className="row-actions">
                  <button type="button" className="icon-button table-action" onClick={row.onEdit} title="Edit" aria-label="Edit deviation">
                    <Edit3 size={15} />
                  </button>
                  <button type="button" className="icon-button table-action danger-action" onClick={row.onDelete} title="Delete" aria-label="Delete deviation">
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
      incomeOverrides: explicit.income_overrides || [],
      debtOverrides: buildDebtOverrideRows(explicit.debt_overrides || [], explicit.interest_rate_overrides || []),
    };
  }

  const baseline = assumptions.baseline_assumptions || {};
  const baselineIncome = baseline.income_sources || [];
  const scenarioIncome = assumptions.income_sources || [];
  const baselineDebts = baseline.debts || [];
  const scenarioDebts = assumptions.debts || [];
  const baselineRates = baseline.interest_rates || [];
  const scenarioRates = assumptions.interest_rates || [];

  const incomeOverrides = scenarioIncome.filter((item) => {
    const baselineItem = baselineIncome.find((candidate) => identityMatches(candidate, item, 'label'));
    return !baselineItem || comparableIncome(baselineItem) !== comparableIncome(item);
  });

  const debtOverrides = scenarioDebts
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
