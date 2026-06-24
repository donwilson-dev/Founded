import React from 'react';
import { GitCompare, GripVertical, Plus, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  foundedApi,
  toDebtPayload,
  toIncomePayload,
  toPromoRatePayload,
  toRegularRatePayload,
} from '../api/foundedApi.js';
import ConfirmingActions from '../components/ConfirmingActions.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InlineAmountInput, { parseInlineAmount } from '../components/InlineAmountInput.jsx';
import ProjectionTable from '../components/ProjectionTable.jsx';
import { accountDisplayName } from '../utils/accountLabels.js';
import { currencyPrecise, labelize, percent, shortMonth } from '../utils/formatters.js';
import {
  getAccountRefId,
  getDebtRefId,
  getFromAccountRefId,
  getRateDebtId,
  getRecordId,
  getToAccountRefId,
  sameRecordId,
} from '../utils/identity.js';
import { debtActualInputValue, debtPaymentUsedValue } from '../utils/paymentFields.js';
import { EstimatedPaymentFields } from '../utils/paymentEstimates.jsx';
import { useSessionState } from '../utils/persistence.js';
import { useProjectionAutoRegeneration } from '../utils/projectionAutoRegeneration.js';
import { hiddenEqualPlusColumns, normalizeProjectionRows, scenarioComparisonColumns } from '../utils/tableHelpers.js';

const MAX_INCOME_DEVIATIONS = 10;
const MAX_DEBT_DEVIATIONS = 10;
const sameId = sameRecordId;
const recordId = getRecordId;
const rateDebtId = getRateDebtId;
const incomeAccountSelectionId = getAccountRefId;
const incomeFromAccountSelectionId = getFromAccountRefId;
const incomeToAccountSelectionId = getToAccountRefId;
const debtAccountSelectionId = getDebtRefId;

const OTHER_DEBT_RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi_weekly', label: 'Bi-Weekly' },
  { value: 'first_and_fifteenth', label: 'First and Fifteenth' },
  { value: 'one_time', label: 'One Time' },
];

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
  targetPayoffActive: false,
  priorityNumber: '',
  recurrence: 'monthly',
  notes: '',
  active: true,
  aprPercentage: '',
  promoAprPercentage: '',
  promoStartDate: '',
  promoEndDate: '',
};

function isoDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function yearlyOtherDebtEndDate(startDate, yearValue) {
  const start = isoDateParts(startDate);
  const year = Number(yearValue);
  if (!start || !Number.isInteger(year)) return '';
  const day = start.month === 2 && start.day === 29 && !isLeapYear(year) ? 28 : start.day;
  return `${year}-${String(start.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function yearlyOtherDebtEndYear(form) {
  return isoDateParts(form.payoffTargetDate)?.year || '';
}

function yearlyOtherDebtEndYearInput(form) {
  return form.payoffTargetYear ?? yearlyOtherDebtEndYear(form);
}

function yearlyOtherDebtEndYearError(form, fallbackStartDate = '') {
  if (!isYearlyOtherDebt(form)) return '';
  const year = String(yearlyOtherDebtEndYearInput(form) || '');
  if (!year) return '';
  if (!/^\d{4}$/.test(year)) return 'End Year must be blank or exactly 4 digits.';
  const paymentDate = form.startDate || fallbackStartDate;
  const anchoredDate = yearlyOtherDebtEndDate(paymentDate, year);
  if (paymentDate && anchoredDate && anchoredDate < paymentDate) return 'End Year must be the payment year or later.';
  return '';
}

function normalizeOtherDebtRecurrence(value) {
  return OTHER_DEBT_RECURRENCE_OPTIONS.some((option) => option.value === value) ? value : 'monthly';
}

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
  const { isRegenerating, runAutoRegeneration } = useProjectionAutoRegeneration({ setStatus });
  const busy = loading || isRegenerating;
  const normalizedScenarioRows = useMemo(() => normalizeProjectionRows(scenario?.generated_rows || []), [scenario]);
  const scenarioTableColumns = useMemo(() => scenarioComparisonColumns(normalizedScenarioRows), [normalizedScenarioRows]);
  const hiddenScenarioColumns = useMemo(() => hiddenEqualPlusColumns(normalizedScenarioRows), [normalizedScenarioRows]);
  const selectedSavedScenario = savedScenarios.find((item) => String(recordId(item)) === String(selectedScenarioId));
  const selectedBaseline = saved.find((item) => String(recordId(item)) === String(baselineId));
  const baselineReady = Boolean(baseline && selectedBaseline);
  const baselineAccounts = useMemo(
    () => baseline?.assumptions_snapshot?.account_balances || baseline?.assumptions_snapshot?.baseline_assumptions?.account_balances || [],
    [baseline]
  );
  const activeBaselineAccounts = useMemo(() => baselineAccounts.filter((item) => item.active !== false), [baselineAccounts]);

  function resetScenarioEditState() {
    setPendingDeleteRow(null);
    setEditingIncomeOverrideIndex(null);
    setEditingDebtOverrideIndex(null);
    setIncomeForm(incomeTemplate);
    setDebtForm(debtTemplate);
    setDebtAprError('');
    setDebtDateError('');
    setShowIncomeForm(false);
    setShowDebtForm(false);
  }

  function clearSelectedScenarioState({ clearOverrides = false } = {}) {
    setSelectedScenarioId('');
    setPendingDeleteScenarioId(null);
    setScenario(null);
    if (clearOverrides) {
      setIncomeOverrides([]);
      setDebtOverrides([]);
    }
    resetScenarioEditState();
  }

  function clearLoadedBaselineState() {
    setBaselineId('');
    setBaseline(null);
    clearSelectedScenarioState({ clearOverrides: true });
  }

  function applySavedProjectionLists(items) {
    const baselines = items.filter((item) => item.projection_type === 'baseline');
    const scenarios = items.filter((item) => item.projection_type === 'scenario');
    setSaved(baselines);
    setSavedScenarios(scenarios);
    if (baselineId && !baselines.some((item) => String(recordId(item)) === String(baselineId))) {
      clearLoadedBaselineState();
    }
    if (selectedScenarioId && !scenarios.some((item) => String(recordId(item)) === String(selectedScenarioId))) {
      clearSelectedScenarioState({ clearOverrides: true });
    }
  }

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
    const selected = baselineAccounts.find((account) => String(recordId(account)) === String(selectedId));
    if (selected && !options.some((account) => String(recordId(account)) === String(recordId(selected)))) {
      options.push(selected);
    }
    return options;
  }

  function accountExists(accountId) {
    return baselineAccounts.some((account) => String(recordId(account)) === String(accountId));
  }

  function accountNameForId(accountId) {
    if (!accountId) return 'Unassigned';
    const account = baselineAccounts.find((item) => String(recordId(item)) === String(accountId));
    return account ? accountDisplayName(account) : 'Unassigned';
  }

  function incomeOverrideAccountLabel(item = {}) {
    if (item.is_account_transfer) {
      return `${accountNameForId(incomeFromAccountSelectionId(item))} -> ${accountNameForId(incomeToAccountSelectionId(item))}`;
    }
    return accountNameForId(incomeAccountSelectionId(item));
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

  const scenarioGenerationPayload = useCallback((nextIncomeOverrides = incomeOverrides, nextDebtOverrides = debtOverrides) => ({
    baselineProjectionId: baselineId,
    incomeOverrides: withDisplayOrder(nextIncomeOverrides),
    debtOverrides: withDisplayOrder(nextDebtOverrides.map((item) => item.debt)),
    interestRateOverrides: nextDebtOverrides.flatMap((item) => item.rates || (item.rate ? [item.rate] : [])).filter(Boolean),
  }), [baselineId, debtOverrides, incomeOverrides]);

  const saveGeneratedScenario = useCallback(async (generated) => {
    const savedScenario = await foundedApi.saveProjection({
      title: selectedSavedScenario?.title || defaultScenarioTitle(baseline),
      projectionType: 'scenario',
      notes: null,
      assumptionsSnapshot: generated.assumptions_snapshot,
      generatedRows: generated.generated_rows || [],
    });
    setSelectedScenarioId(String(recordId(savedScenario)));
    setPendingDeleteScenarioId(null);
    setSavedScenarios((items) => [
      savedScenario,
      ...items.filter((item) => String(recordId(item)) !== String(recordId(savedScenario))),
    ]);
    window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
    return savedScenario;
  }, [baseline, selectedSavedScenario]);

  const autoSaveScenarioProjection = useCallback(async ({
    incomeOverrides: nextIncomeOverrides = incomeOverrides,
    debtOverrides: nextDebtOverrides = debtOverrides,
    successMessage = 'Scenario regenerated and saved.',
  } = {}) => {
    if (!baselineReady) throw new Error('Load a baseline before auto-regeneration.');
    return runAutoRegeneration({
      successMessage,
      task: async (notify) => {
        notify('Generating scenario projection...');
        const generated = await foundedApi.generateScenario(scenarioGenerationPayload(nextIncomeOverrides, nextDebtOverrides));
        notify('Saving regenerated scenario...');
        const savedScenario = await saveGeneratedScenario(generated);
        const currentScenario = {
          ...generated,
          ...savedScenario,
          summary: generated.summary,
          generated_rows: savedScenario.generated_rows || generated.generated_rows || [],
          assumptions_snapshot: savedScenario.assumptions_snapshot || generated.assumptions_snapshot,
        };
        setScenario(currentScenario);
        return currentScenario;
      },
    });
  }, [
    baselineReady,
    debtOverrides,
    incomeOverrides,
    runAutoRegeneration,
    saveGeneratedScenario,
    scenarioGenerationPayload,
    setScenario,
  ]);

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
      .then((items) => applySavedProjectionLists(items))
      .catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    function refreshSavedBaselines() {
      foundedApi
        .listSavedProjections()
        .then((items) => applySavedProjectionLists(items))
        .catch((error) => setStatus(error.message));
    }
    window.addEventListener('founded:saved-projections-changed', refreshSavedBaselines);
    return () => window.removeEventListener('founded:saved-projections-changed', refreshSavedBaselines);
  }, [baselineId, selectedScenarioId]);

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
    const isSwitchingBaseline = String(id || '') !== String(baselineId || '');
    setBaselineId(id);
    resetGeneratedScenarioState();
    if (isSwitchingBaseline) {
      setIncomeOverrides([]);
      setDebtOverrides([]);
      resetScenarioEditState();
    }
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
    clearLoadedBaselineState();
    setStatus('Baseline selection cleared.');
  }

  function resetGeneratedScenarioState() {
    setScenario(null);
    setSelectedScenarioId('');
    setPendingDeleteScenarioId(null);
  }

  async function addIncomeOverride(event) {
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
    const nextIncomeOverrides = editingIncomeOverrideIndex === null
      ? [...incomeOverrides, nextIncome]
      : incomeOverrides.map((item, index) => (index === editingIncomeOverrideIndex ? nextIncome : item));
    setLoading(true);
    try {
      setIncomeOverrides(nextIncomeOverrides);
      setIncomeForm(incomeTemplate);
      setEditingIncomeOverrideIndex(null);
      setShowIncomeForm(false);
      await autoSaveScenarioProjection({
        incomeOverrides: nextIncomeOverrides,
        successMessage: editingIncomeOverrideIndex === null ? 'Income deviation added. Scenario regenerated and saved.' : 'Income deviation updated. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function addDebtOverride(event) {
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
    if (!isOtherDebt(debtForm) && debtForm.targetPayoffActive && !debtForm.payoffTargetDate) {
      setStatus('Target Payoff Date is required.');
      return;
    }
    if (!isOtherDebt(debtForm) && !isValidApr(debtForm.aprPercentage)) {
      setDebtAprError('APR must be 0% or greater.');
      setStatus('APR must be 0% or greater.');
      return;
    }
    setDebtAprError('');
    const existingId = editingDebtOverrideIndex === null ? null : debtOverrides[editingDebtOverrideIndex]?.debt?.id;
    const temporaryId = existingId || Date.now();
    const defaultStartDate = baselineStartMonth(baseline);
    const yearlyEndYearError = yearlyOtherDebtEndYearError(debtForm, defaultStartDate);
    if (yearlyEndYearError) {
      setDebtDateError(yearlyEndYearError);
      setStatus(yearlyEndYearError);
      return;
    }
    const normalizedDebtForm = {
      ...debtForm,
      startingBalance: debtForm.currentBalance,
      startDate: debtForm.startDate || defaultStartDate,
    };
    const debt = { ...toDebtPayload(normalizedDebtForm, { startDate: defaultStartDate }), id: temporaryId };
    const rates = [toRegularRatePayload(normalizedDebtForm, temporaryId), toPromoRatePayload(normalizedDebtForm, temporaryId)].filter(Boolean);
    const next = { debt, rates };
    const nextDebtOverrides = editingDebtOverrideIndex === null
      ? [...debtOverrides, next]
      : debtOverrides.map((item, index) => (index === editingDebtOverrideIndex ? next : item));
    setLoading(true);
    try {
      setDebtOverrides(nextDebtOverrides);
      setDebtForm(debtTemplate);
      setDebtAprError('');
      setDebtDateError('');
      setEditingDebtOverrideIndex(null);
      setShowDebtForm(false);
      await autoSaveScenarioProjection({
        debtOverrides: nextDebtOverrides,
        successMessage: editingDebtOverrideIndex === null ? 'Debt deviation added. Scenario regenerated and saved.' : 'Debt deviation updated. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditDebtOverride(item, index) {
    const rates = item.rates || (item.rate ? [item.rate] : []);
    const promo = rates.find((rate) => rate.end_date);
    const regular = rates.find((rate) => !rate.end_date) || rates.find((rate) => rate.id !== promo?.id);
    setEditingDebtOverrideIndex(index);
    setDebtForm({
      ...debtTemplate,
      name: item.debt.name || '',
      accountBalanceId: debtAccountSelectionId(item.debt),
      debtType: item.debt.debt_type || 'credit_card',
      currentBalance: item.debt.current_balance ?? '',
      minimumMonthlyPayment: item.debt.minimum_monthly_payment ?? '',
      actualPayment: debtActualInputValue(item.debt),
      paymentDate: item.debt.payment_date || item.debt.paymentDate || '',
      startDate: item.debt.start_date || '',
      payoffTargetDate: item.debt.payoff_target_date || '',
      targetPayoffActive: Boolean(item.debt.target_payoff_active),
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

  async function deleteDebtOverride(index) {
    const nextDebtOverrides = debtOverrides.filter((_, itemIndex) => itemIndex !== index);
    setLoading(true);
    try {
      setDebtOverrides(nextDebtOverrides);
      setPendingDeleteRow(null);
      if (editingDebtOverrideIndex === index) {
        setEditingDebtOverrideIndex(null);
        setDebtForm(debtTemplate);
        setDebtAprError('');
        setDebtDateError('');
        setShowDebtForm(false);
      } else if (editingDebtOverrideIndex !== null && editingDebtOverrideIndex > index) {
        setEditingDebtOverrideIndex(editingDebtOverrideIndex - 1);
      }
      await autoSaveScenarioProjection({
        debtOverrides: nextDebtOverrides,
        successMessage: 'Debt deviation deleted. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function inlineUpdateIncomeOverrideAmount(index, value) {
    const amount = parseInlineAmount(value);
    if (amount === null) return;
    const nextIncomeOverrides = incomeOverrides.map((item, itemIndex) => (
      itemIndex === index ? { ...item, amount } : item
    ));
    setLoading(true);
    try {
      setIncomeOverrides(nextIncomeOverrides);
      await autoSaveScenarioProjection({
        incomeOverrides: nextIncomeOverrides,
        successMessage: 'Income deviation amount updated. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function inlineUpdateDebtOverrideAmount(index, value) {
    const amount = parseInlineAmount(value);
    if (amount === null) return;
    const nextDebtOverrides = debtOverrides.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const otherDebt = item.debt?.debt_type === 'other';
      const nextDebt = otherDebt
        ? {
          ...item.debt,
          minimum_monthly_payment: 0,
          actual_monthly_payment: amount,
          planned_extra_payment: amount,
        }
        : {
          ...item.debt,
          current_balance: amount,
          starting_balance: amount,
        };
      return { ...item, debt: nextDebt };
    });
    setLoading(true);
    try {
      setDebtOverrides(nextDebtOverrides);
      await autoSaveScenarioProjection({
        debtOverrides: nextDebtOverrides,
        successMessage: 'Debt deviation amount updated. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleIncomeOverrideActive(index, active) {
    if ((incomeOverrides[index]?.active !== false) === active) return;
    const nextIncomeOverrides = incomeOverrides.map((item, itemIndex) => (
      itemIndex === index ? { ...item, active } : item
    ));
    setLoading(true);
    try {
      setIncomeOverrides(nextIncomeOverrides);
      await autoSaveScenarioProjection({
        incomeOverrides: nextIncomeOverrides,
        successMessage: 'Income deviation active state updated. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleDebtOverrideActive(index, active) {
    if ((debtOverrides[index]?.debt?.active !== false) === active) return;
    const nextDebtOverrides = debtOverrides.map((item, itemIndex) => (
      itemIndex === index ? { ...item, debt: { ...item.debt, active } } : item
    ));
    setLoading(true);
    try {
      setDebtOverrides(nextDebtOverrides);
      await autoSaveScenarioProjection({
        debtOverrides: nextDebtOverrides,
        successMessage: 'Debt deviation active state updated. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditIncomeOverride(item, index) {
    setEditingIncomeOverrideIndex(index);
    setIncomeForm({
      ...incomeTemplate,
      label: item.label || '',
      accountBalanceId: incomeAccountSelectionId(item),
      isAccountTransfer: Boolean(item.is_account_transfer ?? item.isAccountTransfer),
      fromAccountId: incomeFromAccountSelectionId(item),
      toAccountId: incomeToAccountSelectionId(item),
      amount: item.amount ?? '',
      startDate: item.start_date || '',
      endDate: item.end_date || '',
      frequency: item.frequency || 'monthly',
      notes: item.notes || '',
      active: item.active !== false,
    });
    setShowIncomeForm(true);
  }

  async function deleteIncomeOverride(index) {
    const nextIncomeOverrides = incomeOverrides.filter((_, itemIndex) => itemIndex !== index);
    setLoading(true);
    try {
      setIncomeOverrides(nextIncomeOverrides);
      setPendingDeleteRow(null);
      if (editingIncomeOverrideIndex === index) {
        setEditingIncomeOverrideIndex(null);
        setIncomeForm(incomeTemplate);
        setShowIncomeForm(false);
      } else if (editingIncomeOverrideIndex !== null && editingIncomeOverrideIndex > index) {
        setEditingIncomeOverrideIndex(editingIncomeOverrideIndex - 1);
      }
      await autoSaveScenarioProjection({
        incomeOverrides: nextIncomeOverrides,
        successMessage: 'Income deviation deleted. Scenario regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateScenario() {
    setLoading(true);
    try {
      const generated = await foundedApi.generateScenario(scenarioGenerationPayload());
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
      await autoSaveScenarioProjection({ successMessage: 'Scenario generated and saved.' });
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
      await foundedApi.deleteSavedProjection(recordId(item));
      setSavedScenarios((items) => items.filter((scenarioItem) => String(recordId(scenarioItem)) !== String(recordId(item))));
      window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
      if (String(selectedScenarioId) === String(recordId(item))) {
        clearSelectedScenarioState({ clearOverrides: true });
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
      clearSelectedScenarioState({ clearOverrides: true });
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
      setDebtDateError('');
      setPendingDeleteRow(null);
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
              <select value={baselineId} onChange={(event) => loadBaseline(event.target.value)} disabled={busy}>
                <option value="">Select a saved baseline</option>
                {saved.map((item) => (
                  <option key={recordId(item)} value={recordId(item)}>
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
              <select value={selectedScenarioId} onChange={(event) => loadSavedScenario(event.target.value)} disabled={busy}>
                <option value="">Select a saved scenario</option>
                {savedScenarios.map((item) => (
                  <option key={recordId(item)} value={recordId(item)}>
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
                      onClick={() => deleteScenario(savedScenarios.find((item) => String(recordId(item)) === String(selectedScenarioId)))}
                      disabled={busy}
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
                    disabled={busy}
                    title="Delete selected scenario"
                    aria-label="Delete selected scenario"
                  >
                    <Trash2 size={15} />
                  </button>
                )
              ) : null}
            </div>
          </div>
          <button className="outline-button scenario-save-button" onClick={saveScenario} disabled={busy || !baselineReady}>
            <Save size={16} /> Save
          </button>
          {baselineReady ? (
            <button type="button" className="outline-button scenario-save-button" onClick={clearBaseline} disabled={busy}>
              <Plus size={16} /> New
            </button>
          ) : null}
          <button className="primary-button" disabled={!baselineReady || busy} onClick={generateScenario}>
            {busy ? 'Working...' : 'Generate Scenario'}
          </button>
        </div>
      </section>

      <section className="card scenario-panel">
        <div className="card-header">
          <h2>Income Deviations</h2>
          <button className="outline-button" onClick={startAddIncomeOverride} disabled={busy || showIncomeForm} title={incomeOverrides.length >= MAX_INCOME_DEVIATIONS ? 'Maximum of 10 income deviations reached.' : undefined}>
            <Plus size={16} /> Income Deviation
          </button>
        </div>
        <DeviationTable
          columns={['Name', 'Account', 'Start Date', 'Changed Amount', 'Frequency', 'Update', 'Actions']}
          sectionId="income-deviations"
          onReorder={reorderIncomeOverrides}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={busy}
          rows={incomeOverrides.map((item, index) => ({
            id: `${item.label}-${index}`,
            cells: [
              item.label,
              incomeOverrideAccountLabel(item),
              shortMonth(item.start_date),
              currencyPrecise(item.amount),
              labelize(item.frequency || 'monthly'),
              <InlineAmountInput
                key={`income-override-update-${index}`}
                ariaLabel={`Update ${item.label || 'income deviation'} amount`}
                value={item.amount}
                disabled={busy}
                onCommit={(value) => inlineUpdateIncomeOverrideAmount(index, value)}
              />,
            ],
            activeChecked: item.active !== false,
            onToggleActive: (active) => toggleIncomeOverrideActive(index, active),
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
                      {accountOptionsFor(incomeForm.fromAccountId).map((account) => <option key={recordId(account)} value={recordId(account)}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>To Account
                    <select value={incomeForm.toAccountId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, toAccountId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(incomeForm.toAccountId).map((account) => <option key={recordId(account)} value={recordId(account)}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Changed Amount<input type="number" min="0" placeholder="0.00" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} required /></label>
                </>
              ) : (
                <>
                  <label>Account
                    <select value={incomeForm.accountBalanceId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, accountBalanceId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(incomeForm.accountBalanceId).map((account) => <option key={recordId(account)} value={recordId(account)}>{accountDisplayName(account)}</option>)}
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
              <button className="primary-button" disabled={busy}>{busy ? 'Processing...' : editingIncomeOverrideIndex === null ? 'Save Income Change' : 'Update Income Change'}</button>
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
          <button className="outline-button" onClick={startAddDebtOverride} disabled={busy || showDebtForm} title={debtOverrides.length >= MAX_DEBT_DEVIATIONS ? 'Maximum of 10 debt deviations reached.' : undefined}>
            <Plus size={16} /> Debt Deviation
          </button>
        </div>
        <DeviationTable
          columns={['Debt Name', 'Type', 'Balance', 'Min Pay', 'Actual Payment', 'APR', 'Update', 'Actions']}
          sectionId="debt-deviations"
          onReorder={reorderDebtOverrides}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={busy}
          rows={debtOverrides.map((item, index) => ({
            id: recordId(item.debt) || index,
            cells: [
              item.debt.name,
              labelize(item.debt.debt_type),
              currencyPrecise(item.debt.current_balance),
              currencyPrecise(item.debt.minimum_monthly_payment),
              currencyPrecise(debtPaymentUsedValue(item.debt)),
              item.debt.debt_type === 'other' ? labelize(item.debt.recurrence || 'monthly') : primaryApr(item),
              <InlineAmountInput
                key={`debt-override-update-${index}`}
                ariaLabel={`Update ${item.debt.name || 'debt deviation'} amount`}
                value={item.debt.debt_type === 'other' ? debtPaymentUsedValue(item.debt) : item.debt.current_balance}
                disabled={busy}
                onCommit={(value) => inlineUpdateDebtOverrideAmount(index, value)}
              />,
            ],
            activeChecked: item.debt.active !== false,
            onToggleActive: (active) => toggleDebtOverrideActive(index, active),
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
                      {accountOptionsFor(debtForm.accountBalanceId).map((account) => <option key={recordId(account)} value={recordId(account)}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Standard APR %<input type="number" min="0" step="0.01" placeholder="0.00" value={debtForm.aprPercentage} onChange={(e) => {
                    setDebtForm({ ...debtForm, aprPercentage: e.target.value });
                    if (isValidApr(e.target.value)) setDebtAprError('');
                  }} /></label>
                  {debtAprError ? <p className="field-error">{debtAprError}</p> : null}
                  <label>Promo APR %<input type="number" min="0" step="0.01" placeholder="Optional" value={debtForm.promoAprPercentage} onChange={(e) => setDebtForm({ ...debtForm, promoAprPercentage: e.target.value })} /></label>
                  <label>Promo Start Date<input type="date" value={debtForm.promoStartDate} onChange={(e) => setDebtForm({ ...debtForm, promoStartDate: e.target.value })} /></label>
                  <label>Promo End Date<input type="date" value={debtForm.promoEndDate} onChange={(e) => setDebtForm({ ...debtForm, promoEndDate: e.target.value })} /></label>
                </div>
              ) : (
                <div className="form-column">
                  <label>Account
                    <select value={debtForm.accountBalanceId || ''} onChange={(e) => setDebtForm({ ...debtForm, accountBalanceId: e.target.value })}>
                      <option value="">Select account</option>
                      {accountOptionsFor(debtForm.accountBalanceId).map((account) => <option key={recordId(account)} value={recordId(account)}>{accountDisplayName(account)}</option>)}
                    </select>
                  </label>
                  <label>Recurring
                    <select
                      value={normalizeOtherDebtRecurrence(debtForm.recurrence || 'monthly')}
                      onChange={(e) => {
                        const recurrence = e.target.value;
                        setDebtForm((current) => ({
                          ...current,
                          recurrence,
                          payoffTargetDate: recurrence === 'one_time'
                            ? ''
                            : recurrence === 'yearly' && current.payoffTargetDate
                              ? yearlyOtherDebtEndDate(current.startDate, yearlyOtherDebtEndYearInput(current))
                              : current.payoffTargetDate,
                        }));
                      }}
                    >
                      {OTHER_DEBT_RECURRENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <>
                    <label>{isOneTimeOtherDebt(debtForm) ? 'Date' : isYearlyOtherDebt(debtForm) ? 'Payment Date' : 'Start Date'}<input type="date" value={debtForm.startDate} onChange={(e) => {
                      const startDate = e.target.value;
                      setDebtForm((current) => ({
                        ...current,
                        startDate,
                        payoffTargetDate: isYearlyOtherDebt(current) && current.payoffTargetDate
                          ? yearlyOtherDebtEndDate(startDate, yearlyOtherDebtEndYearInput(current))
                          : current.payoffTargetDate,
                      }));
                    }} /></label>
                    {isYearlyOtherDebt(debtForm) ? (
                      <label>End Year<input type="text" inputMode="numeric" pattern="[0-9]*" maxLength="4" placeholder="YYYY" value={yearlyOtherDebtEndYearInput(debtForm)} onChange={(e) => {
                        const year = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setDebtForm({ ...debtForm, payoffTargetYear: year, payoffTargetDate: year.length === 4 ? yearlyOtherDebtEndDate(debtForm.startDate, year) : '' });
                        if (!year || year.length === 4) setDebtDateError('');
                      }} /></label>
                    ) : !isOneTimeOtherDebt(debtForm) ? (
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
                    {debtDateError ? <p className="field-error">{debtDateError}</p> : null}
                  </>
                ) : null}
                <EstimatedPaymentFields form={debtForm} />
                <label>Notes<textarea placeholder="Optional notes" value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} /></label>
              </div>
            </div>
            <div className="form-actions-row">
              <button className="primary-button" disabled={busy}>{busy ? 'Processing...' : editingDebtOverrideIndex === null ? 'Save Debt Change' : 'Update Debt Change'}</button>
              <label className="checkbox-line">
                <input type="checkbox" checked={debtForm.active} onChange={(e) => setDebtForm({ ...debtForm, active: e.target.checked })} /> Active
              </label>
              {!isOtherDebt(debtForm) ? (
                <div className="target-payoff-action">
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={debtForm.targetPayoffActive}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDebtForm((current) => ({ ...current, targetPayoffActive: checked }));
                      }}
                    /> Target Payoff
                  </label>
                  {debtForm.targetPayoffActive ? (
                    <input
                      type="date"
                      value={debtForm.payoffTargetDate}
                      aria-label="Target Payoff Date"
                      onInput={(e) => {
                        const value = e.currentTarget.value;
                        setDebtForm((current) => ({ ...current, payoffTargetDate: value, targetPayoffActive: Boolean(value) || current.targetPayoffActive }));
                      }}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDebtForm((current) => ({ ...current, payoffTargetDate: value, targetPayoffActive: Boolean(value) || current.targetPayoffActive }));
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
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
          preferredColumns={scenarioTableColumns}
          hiddenColumns={hiddenScenarioColumns}
          initialVisibleCount={17}
          storageKey="founded.scenario.comparisonTable.v3"
          visibilityResetKey={`scenario:${scenarioTableColumns.join('|')}:${hiddenScenarioColumns.join('|')}`}
          enableColumnReorder
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
                <ConfirmingActions
                  confirming={isPendingDelete(pendingDeleteRow, sectionId, row.id)}
                  loading={loading}
                  activeChecked={row.activeChecked}
                  onToggleActive={row.onToggleActive}
                  onConfirm={row.onDelete}
                  onCancel={onCancelDelete}
                  onEdit={row.onEdit}
                  onRequestDelete={() => onRequestDelete?.({ sectionId, id: row.id })}
                  editLabel="Edit deviation"
                  deleteLabel="Delete deviation"
                />
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
  const candidates = [
    baseline?.start_month,
    baseline?.startMonth,
    baseline?.assumptions_snapshot?.projection_start_month,
    baseline?.assumptions_snapshot?.start_month,
    baseline?.assumptions_snapshot?.projectionParams?.startMonth,
    baseline?.assumptions_snapshot?.baseline_assumptions?.projection_start_month,
    baseline?.generated_rows?.[0]?.month,
  ];
  return candidates.map(toIsoMonthStart).find(Boolean) || new Date().toISOString().slice(0, 10);
}

function toIsoMonthStart(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(0, 7)}-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;

  const match = String(value).trim().match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (!match) return '';
  const monthIndex = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ].indexOf(match[1].slice(0, 3).toLowerCase());
  if (monthIndex < 0) return '';
  return `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

function defaultScenarioTitle(baseline) {
  return baseline?.title ? `${baseline.title} Scenario` : 'Scenario';
}

function isOneTimeIncome(form) {
  return form.frequency === 'one_time';
}

function isOtherDebt(formOrDebt) {
  return formOrDebt?.debtType === 'other' || formOrDebt?.debt_type === 'other';
}

function isValidApr(value) {
  if (value === '' || value === null || value === undefined) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function isOneTimeOtherDebt(formOrDebt) {
  return isOtherDebt(formOrDebt) && (formOrDebt?.recurrence || 'monthly') === 'one_time';
}

function isYearlyOtherDebt(formOrDebt) {
  return isOtherDebt(formOrDebt) && (formOrDebt?.recurrence || 'monthly') === 'yearly';
}

function normalizeDebtFormForType(form) {
  if (!isOtherDebt(form)) return form;
  return {
    ...form,
    startingBalance: '',
    currentBalance: '',
    recurrence: normalizeOtherDebtRecurrence(form.recurrence || 'monthly'),
    targetPayoffActive: false,
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
      const baselineItem = baselineDebts.find((candidate) => debtIdentityMatches(candidate, item));
      const debtChanged = !baselineItem || comparableDebt(baselineItem) !== comparableDebt(item);
      const baselineDebtRates = baselineRates.filter((rate) => sameId(rateDebtId(rate), recordId(item)));
      const scenarioDebtRates = scenarioRates.filter((rate) => sameId(rateDebtId(rate), recordId(item)));
      return debtChanged || comparableRates(baselineDebtRates) !== comparableRates(scenarioDebtRates);
    })
    .map((debt) => ({
      debt,
      rates: scenarioRates.filter((rate) => sameId(rateDebtId(rate), recordId(debt))),
    }));

  return { incomeOverrides, debtOverrides };
}

function buildDebtOverrideRows(debts = [], rates = []) {
  return debts.map((debt) => ({
    debt,
    rates: rates.filter((rate) => sameId(rateDebtId(rate), recordId(debt))),
  }));
}

function identityMatches(left, right, naturalKey) {
  if (left?.id !== undefined && right?.id !== undefined && left.id !== null && right.id !== null) {
    return sameId(left.id, right.id);
  }
  return left?.[naturalKey] && left[naturalKey] === right?.[naturalKey];
}

function debtIdentityMatches(left, right) {
  if (left?.id !== undefined && right?.id !== undefined && left.id !== null && right.id !== null) {
    return sameId(left.id, right.id);
  }
  if (left?._projection_label && right?._projection_label) {
    return left._projection_label === right._projection_label;
  }
  return false;
}

function comparableIncome(item = {}) {
  return JSON.stringify({
    account_balance_id: incomeAccountSelectionId(item) || null,
    is_account_transfer: Boolean(item.is_account_transfer),
    from_account_id: incomeFromAccountSelectionId(item) || null,
    to_account_id: incomeToAccountSelectionId(item) || null,
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
    account_balance_id: debtAccountSelectionId(item) || null,
    name: item.name || '',
    debt_type: item.debt_type || '',
    current_balance: Number(item.current_balance || 0),
    minimum_monthly_payment: Number(item.minimum_monthly_payment || 0),
    actual_monthly_payment: Number(item.actual_monthly_payment || 0),
    planned_extra_payment: Number(item.planned_extra_payment || 0),
    recurrence: item.recurrence || null,
    payment_date: item.payment_date || null,
    start_date: item.start_date || '',
    payoff_target_date: item.payoff_target_date || null,
    target_payoff_active: Boolean(item.target_payoff_active),
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
