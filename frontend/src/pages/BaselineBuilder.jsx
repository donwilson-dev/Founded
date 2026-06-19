import React from 'react';
import {
  CalendarCheck,
  CircleDollarSign,
  CreditCard,
  GripVertical,
  Landmark,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  foundedApi,
  toAccountBalancePayload,
  toDebtPayload,
  toIncomePayload,
  toPromoRatePayload,
  toRegularRatePayload,
} from '../api/foundedApi.js';
import ConfirmingActions from '../components/ConfirmingActions.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InlineAmountInput, { parseInlineAmount } from '../components/InlineAmountInput.jsx';
import ProjectionTable from '../components/ProjectionTable.jsx';
import SummaryCard from '../components/SummaryCard.jsx';
import { accountDisplayName } from '../utils/accountLabels.js';
import { currency, currencyPrecise, labelize, percent, shortMonth } from '../utils/formatters.js';
import {
  getAccountRefId,
  getDebtRefId,
  getFromAccountRefId,
  getRecordId,
  getToAccountRefId,
} from '../utils/identity.js';
import { EstimatedPaymentFields } from '../utils/paymentEstimates.jsx';
import { useSessionState } from '../utils/persistence.js';
import { useProjectionAutoRegeneration } from '../utils/projectionAutoRegeneration.js';
import { TABLE_COLUMN_VIEWS, normalizeProjectionRows } from '../utils/tableHelpers.js';

const MAX_ACCOUNT_BALANCES = 15;
const MAX_INCOME_SOURCES = 15;
const MAX_DEBTS = 25;
const ACCOUNT_REFERENCE_MESSAGE = 'This account is currently referenced by existing records. Reassign or remove dependent records before deleting this account.';
const recordId = getRecordId;
const rateRecordId = getRecordId;
const incomeRecordId = getRecordId;
const debtAccountSelectionId = getDebtRefId;
const incomeAccountSelectionId = getAccountRefId;
const incomeFromAccountSelectionId = getFromAccountRefId;
const incomeToAccountSelectionId = getToAccountRefId;

const initialIncome = {
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

const initialAccountBalance = {
  name: '',
  owner: '',
  accountType: '',
  amount: '',
  date: '',
  notes: '',
  active: true,
};

const initialDebt = {
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

function defaultDebtStartDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function currentMonthStart() {
  return defaultDebtStartDate();
}

function splitRates(rates = []) {
  const promo = rates.find((rate) => rate.end_date);
  const regular = rates.find((rate) => !rate.end_date) || rates.find((rate) => String(rateRecordId(rate)) !== String(rateRecordId(promo)));
  return { promo, regular };
}

function isOneTimeIncome(form) {
  return form.frequency === 'one_time';
}

export default function BaselineBuilder({ isActive = false }) {
  const [accountBalances, setAccountBalances] = useSessionState('founded.baseline.accountBalances', []);
  const [incomeSources, setIncomeSources] = useSessionState('founded.baseline.incomeSources', []);
  const [debts, setDebts] = useSessionState('founded.baseline.debts', []);
  const [savedProjections, setSavedProjections] = useState([]);
  const [projection, setProjection] = useSessionState('founded.baseline.projection', null);
  const [projectionTitle, setProjectionTitle] = useSessionState('founded.baseline.projectionTitle', '');
  const [projectionNotes, setProjectionNotes] = useSessionState('founded.baseline.projectionNotes', '');
  const [accountBalanceForm, setAccountBalanceForm] = useSessionState('founded.baseline.accountBalanceForm', initialAccountBalance);
  const [incomeForm, setIncomeForm] = useSessionState('founded.baseline.incomeForm', initialIncome);
  const [debtForm, setDebtForm] = useSessionState('founded.baseline.debtForm', initialDebt);
  const [editingAccountBalanceId, setEditingAccountBalanceId] = useSessionState('founded.baseline.editingAccountBalanceId', null);
  const [editingIncomeId, setEditingIncomeId] = useSessionState('founded.baseline.editingIncomeId', null);
  const [editingDebtId, setEditingDebtId] = useSessionState('founded.baseline.editingDebtId', null);
  const [showAccountBalanceForm, setShowAccountBalanceForm] = useSessionState('founded.baseline.showAccountBalanceForm', false);
  const [showIncomeForm, setShowIncomeForm] = useSessionState('founded.baseline.showIncomeForm', false);
  const [showDebtForm, setShowDebtForm] = useSessionState('founded.baseline.showDebtForm', false);
  const [projectionParams, setProjectionParams] = useSessionState('founded.baseline.projectionParams', { startMonth: todayDate(), months: 60, endMonth: '' });
  const [selectedSavedProjectionId, setSelectedSavedProjectionId] = useSessionState('founded.baseline.selectedSavedProjectionId', '');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [debtDateError, setDebtDateError] = useState('');
  const [pendingDeleteProjectionId, setPendingDeleteProjectionId] = useState(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);
  const [pendingDeleteRateId, setPendingDeleteRateId] = useState(null);
  const accountBalanceFormRef = useRef(null);
  const incomeFormRef = useRef(null);
  const debtFormRef = useRef(null);
  const { isRegenerating, runAutoRegeneration } = useProjectionAutoRegeneration({ setStatus });
  const busy = loading || isRegenerating;

  async function refresh({ includeInputs = true } = {}) {
    try {
      if (!includeInputs) {
        const saved = await foundedApi.listSavedProjections();
        setSavedProjections(saved.filter((item) => item.projection_type === 'baseline'));
        return;
      }
      const [balances, income, debtList, saved] = await Promise.all([
        foundedApi.listAccountBalances(),
        foundedApi.listIncomeSources(),
        foundedApi.listDebts(),
        foundedApi.listSavedProjections(),
      ]);
      setAccountBalances(balances);
      setIncomeSources(income);
      setDebts(debtList);
      setSavedProjections(saved.filter((item) => item.projection_type === 'baseline'));
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function refreshSavedProjections() {
    const saved = await foundedApi.listSavedProjections();
    setSavedProjections(saved.filter((item) => item.projection_type === 'baseline'));
  }

  useEffect(() => {
    refresh({ includeInputs: false }).catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (!status) return undefined;
    const timeout = window.setTimeout(() => setStatus(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (isActive && selectedSavedProjectionId) {
      openProjection(selectedSavedProjectionId);
    }
  }, [isActive, selectedSavedProjectionId]);

  useEffect(() => {
    if (!isActive) return;
    const section = window.sessionStorage.getItem('founded.baseline.focusSection');
    if (!section) return;
    window.sessionStorage.removeItem('founded.baseline.focusSection');
    window.setTimeout(() => {
      document.querySelector(`[data-baseline-section="${section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, [isActive, accountBalances.length, incomeSources.length, debts.length]);

  useEffect(() => {
    function openRequestedProjection(event) {
      const requestedId = event.detail?.projectionId || window.sessionStorage.getItem('founded.baseline.openProjectionId');
      if (!requestedId) return;
      window.sessionStorage.removeItem('founded.baseline.openProjectionId');
      openProjection(requestedId);
    }
    window.addEventListener('founded:open-baseline', openRequestedProjection);
    const storedId = window.sessionStorage.getItem('founded.baseline.openProjectionId');
    if (storedId) openRequestedProjection({ detail: { projectionId: storedId } });
    return () => window.removeEventListener('founded:open-baseline', openRequestedProjection);
  }, []);

  const rows = projection?.generated_rows || [];
  const normalizedRows = useMemo(() => normalizeProjectionRows(rows), [rows]);
  const summary = useMemo(() => {
    const first = rows[0] || {};
    const payoff = rows.find((row) => rowValue(row, 'Total Debt') === 0);
    const projectedPayoff = projection?.summary?.projected_payoff_date || projection?.assumptions_snapshot?._projection_summary?.projected_payoff_date;
    if (!rows.length) {
      const income = incomeSources
        .filter((item) => item.active !== false)
        .reduce((sum, item) => sum + monthlyIncomeAmount(item), 0);
      const payments = debts
        .filter((debt) => debt.active !== false)
        .reduce((sum, debt) => sum + Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0), 0);
      const debt = debts
        .filter((item) => item.active !== false)
        .reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
      return {
        income,
        payments,
        debt,
        remainingCash: income - payments,
        payoff: projectedPayoff || null,
      };
    }
    return {
      income: rowValue(first, 'Income'),
      payments: rowValue(first, 'Total Debt Payments'),
      debt: rowValue(first, 'Total Debt'),
      remainingCash: rowValue(first, 'Monthly Surplus'),
      payoff: payoff?.month || projectedPayoff || null,
    };
  }, [rows, projection, incomeSources, debts]);

  const editingDebt = debts.find((debt) => String(recordId(debt)) === String(editingDebtId));
  const selectedSavedProjection = savedProjections.find((item) => String(recordId(item)) === String(selectedSavedProjectionId));
  const activeAccountBalances = useMemo(() => accountBalances.filter((item) => item.active !== false), [accountBalances]);

  function reorderAccountBalances(fromIndex, toIndex) {
    setAccountBalances((items) => reorderItems(items, fromIndex, toIndex));
  }

  function reorderIncomeSources(fromIndex, toIndex) {
    setIncomeSources((items) => reorderItems(items, fromIndex, toIndex));
  }

  function reorderDebts(fromIndex, toIndex) {
    setDebts((items) => reorderItems(items, fromIndex, toIndex));
  }

  function accountOptionsFor(selectedId) {
    const options = [...activeAccountBalances];
    const selected = accountBalances.find((account) => String(recordId(account)) === String(selectedId));
    if (selected && !options.some((account) => String(recordId(account)) === String(recordId(selected)))) {
      options.push(selected);
    }
    return options;
  }

  function accountExists(accountId) {
    return accountBalances.some((account) => String(recordId(account)) === String(accountId));
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

  function accountIsReferenced(accountId) {
    const matches = (value) => String(value || '') === String(accountId);
    return incomeSources.some((source) => (
      matches(incomeAccountSelectionId(source))
      || matches(incomeFromAccountSelectionId(source))
      || matches(incomeToAccountSelectionId(source))
    )) || debts.some((debt) => (
      matches(debt.legacy_account_balance_id)
      || matches(debt.account_balance_id ?? debt.accountBalanceId)
    ));
  }

  function focusOpenedForm(ref) {
    window.setTimeout(() => {
      const form = ref.current;
      if (!form) return;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    }, 0);
  }

  const autoSaveBaselineProjection = useCallback(async ({
    accountBalances: nextAccountBalances = accountBalances,
    incomeSources: nextIncomeSources = incomeSources,
    debts: nextDebts = debts,
    successMessage = 'Projection regenerated and saved.',
  } = {}) => {
    if (!projectionTitle.trim()) {
      setProjection(null);
      throw new Error('Baseline Title is required before auto-regeneration.');
    }

    return runAutoRegeneration({
      successMessage,
      task: async (notify) => {
        notify('Generating baseline projection...');
        const generated = await foundedApi.generateBaselineProjection({
          ...projectionParams,
          startMonth: currentMonthStart(),
          accountBalanceIds: nextAccountBalances.map((item) => recordId(item)),
          incomeSourceIds: nextIncomeSources.map((item) => incomeRecordId(item)),
          debtIds: nextDebts.map((item) => recordId(item)),
        });
        const nextProjection = {
          ...generated,
          assumptions_snapshot: buildSourceSnapshot(
            nextAccountBalances,
            nextIncomeSources,
            nextDebts,
            generated.assumptions_snapshot
          ),
        };
        notify('Saving regenerated baseline projection...');
        const saved = await foundedApi.saveProjection({
          title: projectionTitle,
          projectionType: 'baseline',
          notes: projectionNotes,
          assumptionsSnapshot: nextProjection.assumptions_snapshot,
          generatedRows: nextProjection.generated_rows || [],
        });
        setProjection(nextProjection);
        setSelectedSavedProjectionId(String(recordId(saved)));
        await refreshSavedProjections();
        window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
        return { generated: nextProjection, saved };
      },
    });
  }, [
    accountBalances,
    debts,
    incomeSources,
    projectionNotes,
    projectionParams,
    projectionTitle,
    runAutoRegeneration,
    setProjection,
    setSelectedSavedProjectionId,
  ]);

  function startAddAccountBalance() {
    if (accountBalances.length >= MAX_ACCOUNT_BALANCES) {
      setStatus('Maximum of 15 account balances reached.');
      return;
    }
    setEditingAccountBalanceId(null);
    setAccountBalanceForm({ ...initialAccountBalance, date: todayDate() });
    setShowAccountBalanceForm(true);
    focusOpenedForm(accountBalanceFormRef);
  }

  function startEditAccountBalance(balance) {
    setEditingAccountBalanceId(recordId(balance));
    setAccountBalanceForm({
      name: balance.name || '',
      owner: balance.owner || '',
      accountType: balance.account_type || balance.accountType || '',
      amount: balance.amount ?? '',
      date: balance.date || todayDate(),
      notes: balance.notes || '',
      active: Boolean(balance.active),
    });
    setShowAccountBalanceForm(true);
  }

  function cancelAccountBalanceForm() {
    setEditingAccountBalanceId(null);
    setAccountBalanceForm(initialAccountBalance);
    setShowAccountBalanceForm(false);
  }

  function startAddIncome() {
    if (incomeSources.length >= MAX_INCOME_SOURCES) {
      setStatus('Maximum of 15 income sources reached.');
      return;
    }
    setEditingIncomeId(null);
    setIncomeForm({ ...initialIncome, startDate: todayDate() });
    setShowIncomeForm(true);
    focusOpenedForm(incomeFormRef);
  }

  function startEditIncome(source) {
    setEditingIncomeId(incomeRecordId(source));
    setIncomeForm({
      label: source.label || '',
      accountBalanceId: incomeAccountSelectionId(source),
      isAccountTransfer: Boolean(source.is_account_transfer ?? source.isAccountTransfer),
      fromAccountId: incomeFromAccountSelectionId(source),
      toAccountId: incomeToAccountSelectionId(source),
      amount: source.amount ?? '',
      startDate: source.start_date || todayDate(),
      endDate: source.end_date || '',
      frequency: source.frequency || 'monthly',
      notes: source.notes || '',
      active: Boolean(source.active),
    });
    setShowIncomeForm(true);
  }

  function cancelIncomeForm() {
    setEditingIncomeId(null);
    setIncomeForm(initialIncome);
    setShowIncomeForm(false);
  }

  function startAddDebt() {
    if (debts.length >= MAX_DEBTS) {
      setStatus('Maximum of 25 debts reached.');
      return;
    }
    setEditingDebtId(null);
    setDebtForm({ ...initialDebt, startDate: defaultDebtStartDate() });
    setDebtDateError('');
    setShowDebtForm(true);
    focusOpenedForm(debtFormRef);
  }

  function startEditDebt(debt) {
    const { promo, regular } = splitRates(debt.interest_rates);
    setEditingDebtId(recordId(debt));
    setDebtForm({
      name: debt.name || '',
      accountBalanceId: debtAccountSelectionId(debt),
      debtType: debt.debt_type || 'credit_card',
      startingBalance: debt.current_balance ?? '',
      currentBalance: debt.current_balance ?? '',
      minimumMonthlyPayment: debt.minimum_monthly_payment ?? '',
      actualPayment: Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0),
      plannedExtraPayment: debt.planned_extra_payment ?? 0,
      paymentDate: debt.payment_date || debt.paymentDate || '',
      startDate: debt.start_date || '',
      payoffTargetDate: debt.payoff_target_date || '',
      priorityNumber: debt.priority_number ?? '',
      recurrence: debt.recurrence || 'monthly',
      notes: debt.notes || '',
      active: Boolean(debt.active),
      aprPercentage: regular?.apr_percentage ?? '',
      promoAprPercentage: promo?.apr_percentage ?? '',
      promoStartDate: promo?.start_date || '',
      promoEndDate: promo?.end_date || '',
    });
    setDebtDateError('');
    setShowDebtForm(true);
  }

  function cancelDebtForm() {
    setEditingDebtId(null);
    setDebtForm(initialDebt);
    setDebtDateError('');
    setShowDebtForm(false);
  }

  async function submitAccountBalance(event) {
    event.preventDefault();
    setLoading(true);
    try {
      let nextAccountBalances;
      if (editingAccountBalanceId) {
        const updated = await foundedApi.updateAccountBalance(editingAccountBalanceId, toAccountBalancePayload(accountBalanceForm));
        nextAccountBalances = accountBalances.map((item) => (String(recordId(item)) === String(recordId(updated)) ? updated : item));
        setAccountBalances(nextAccountBalances);
      } else {
        const created = await foundedApi.createAccountBalance(toAccountBalancePayload(accountBalanceForm));
        nextAccountBalances = [...accountBalances, created];
        setAccountBalances(nextAccountBalances);
      }
      cancelAccountBalanceForm();
      await autoSaveBaselineProjection({
        accountBalances: nextAccountBalances,
        successMessage: editingAccountBalanceId ? 'Account balance updated. Projection regenerated and saved.' : 'Account balance added. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function inlineUpdateAccountBalanceAmount(balance, value) {
    const amount = parseInlineAmount(value);
    if (amount === null) return;
    if (amount === Number(balance.amount || 0)) return;
    const balanceId = recordId(balance);
    setLoading(true);
    try {
      const updated = await foundedApi.updateAccountBalance(balanceId, toAccountBalancePayload({
        name: balance.name || '',
        owner: balance.owner || '',
        accountType: balance.account_type || balance.accountType || '',
        amount,
        date: balance.date || todayDate(),
        notes: balance.notes || '',
        active: balance.active !== false,
      }));
      const nextAccountBalances = accountBalances.map((item) => (String(recordId(item)) === String(recordId(updated)) ? updated : item));
      setAccountBalances(nextAccountBalances);
      await autoSaveBaselineProjection({
        accountBalances: nextAccountBalances,
        successMessage: 'Account balance updated. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccountBalance(balance) {
    const balanceId = recordId(balance);
    if (accountIsReferenced(balanceId)) {
      setStatus(ACCOUNT_REFERENCE_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      await foundedApi.deleteAccountBalance(balanceId);
      const nextAccountBalances = accountBalances.filter((item) => String(recordId(item)) !== String(recordId(balance)));
      setAccountBalances(nextAccountBalances);
      if (String(editingAccountBalanceId) === String(balanceId)) {
        cancelAccountBalanceForm();
      }
      setPendingDeleteRow(null);
      await autoSaveBaselineProjection({
        accountBalances: nextAccountBalances,
        successMessage: 'Account balance deleted. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitIncome(event) {
    event.preventDefault();
    const accountError = validateIncomeAccountSelection();
    if (accountError) {
      setStatus(accountError);
      return;
    }
    setLoading(true);
    try {
      let nextIncomeSources;
      if (editingIncomeId) {
        const updated = await foundedApi.updateIncomeSource(editingIncomeId, toIncomePayload(incomeForm));
        nextIncomeSources = incomeSources.map((item) => (String(incomeRecordId(item)) === String(incomeRecordId(updated)) ? updated : item));
        setIncomeSources(nextIncomeSources);
      } else {
        const created = await foundedApi.createIncomeSource(toIncomePayload(incomeForm));
        nextIncomeSources = [...incomeSources, created];
        setIncomeSources(nextIncomeSources);
      }
      cancelIncomeForm();
      await autoSaveBaselineProjection({
        incomeSources: nextIncomeSources,
        successMessage: editingIncomeId ? 'Income source updated. Projection regenerated and saved.' : 'Income source added. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteIncome(source) {
    const sourceId = incomeRecordId(source);
    setLoading(true);
    try {
      await foundedApi.deleteIncomeSource(sourceId);
      const nextIncomeSources = incomeSources.filter((item) => String(incomeRecordId(item)) !== String(sourceId));
      setIncomeSources(nextIncomeSources);
      if (String(editingIncomeId) === String(sourceId)) {
        cancelIncomeForm();
      }
      setPendingDeleteRow(null);
      await autoSaveBaselineProjection({
        incomeSources: nextIncomeSources,
        successMessage: 'Income source deleted. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitDebt(event) {
    event.preventDefault();
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
    if (debtForm.debtType !== 'other' && debtForm.promoAprPercentage !== '' && (!debtForm.promoStartDate || !debtForm.promoEndDate)) {
      setStatus('Promo APR requires both Promo Start Date and Promo End Date.');
      return;
    }
    setLoading(true);
    try {
      let debtId = editingDebtId;
      if (editingDebtId) {
        await foundedApi.updateDebt(editingDebtId, toDebtPayload(debtForm));
        setStatus('Debt updated.');
      } else {
        const created = await foundedApi.createDebt(toDebtPayload(debtForm));
        debtId = created.id;
        setStatus('Debt added.');
      }

      if (editingDebtId) {
        let persistedRates = [];
        try {
          persistedRates = await foundedApi.listInterestRates(debtId);
        } catch {
          persistedRates = debts.find((debt) => String(recordId(debt)) === String(editingDebtId))?.interest_rates || [];
        }
        await Promise.all(persistedRates.map((rate) => deleteInterestRateQuietly(rateRecordId(rate))));
      }

      const regularRatePayload = toRegularRatePayload(debtForm, debtId);
      const promoRatePayload = toPromoRatePayload(debtForm, debtId);
      if (regularRatePayload) await foundedApi.createInterestRate(regularRatePayload);
      if (promoRatePayload) await foundedApi.createInterestRate(promoRatePayload);
      const debtWithRates = await fetchDebtWithRates(debtId);
      const exists = debts.some((item) => String(recordId(item)) === String(recordId(debtWithRates)));
      const nextDebts = exists
        ? debts.map((item) => (String(recordId(item)) === String(recordId(debtWithRates)) ? debtWithRates : item))
        : [...debts, debtWithRates];
      setDebts(nextDebts);
      setDebtDateError('');

      cancelDebtForm();
      await autoSaveBaselineProjection({
        debts: nextDebts,
        successMessage: editingDebtId ? 'Debt updated. Projection regenerated and saved.' : 'Debt added. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function inlineUpdateDebtBalance(debt, value) {
    const currentBalance = parseInlineAmount(value);
    if (currentBalance === null) return;
    const otherDebt = debt.debt_type === 'other';
    const existingValue = otherDebt
      ? Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0)
      : Number(debt.current_balance || 0);
    if (currentBalance === existingValue) return;
    setLoading(true);
    try {
      const actualPayment = Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0);
      const debtId = recordId(debt);
      await foundedApi.updateDebt(debtId, toDebtPayload({
        name: debt.name || '',
        accountBalanceId: debtAccountSelectionId(debt),
        debtType: debt.debt_type || 'credit_card',
        startingBalance: currentBalance,
        currentBalance: otherDebt ? debt.current_balance || 0 : currentBalance,
        minimumMonthlyPayment: otherDebt ? currentBalance : debt.minimum_monthly_payment ?? 0,
        actualPayment: otherDebt ? currentBalance : actualPayment,
        plannedExtraPayment: debt.planned_extra_payment ?? 0,
        paymentDate: debt.payment_date || debt.paymentDate || '',
        startDate: debt.start_date || '',
        payoffTargetDate: debt.payoff_target_date || '',
        priorityNumber: debt.priority_number ?? '',
        recurrence: debt.recurrence || 'monthly',
        notes: debt.notes || '',
        active: debt.active !== false,
      }));
      const updated = await fetchDebtWithRates(debtId, debt);
      const updatedWithRates = {
        ...updated,
        interest_rates: updated.interest_rates || debt.interest_rates || [],
      };
      const nextDebts = debts.map((item) => (String(recordId(item)) === String(recordId(updatedWithRates)) ? updatedWithRates : item));
      setDebts(nextDebts);
      await autoSaveBaselineProjection({
        debts: nextDebts,
        successMessage: 'Debt balance updated. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteDebt(debt) {
    const debtId = recordId(debt);
    setLoading(true);
    try {
      await foundedApi.deleteDebt(debtId);
      const nextDebts = debts.filter((item) => String(recordId(item)) !== String(recordId(debt)));
      setDebts(nextDebts);
      if (String(editingDebtId) === String(debtId)) {
        cancelDebtForm();
      }
      setPendingDeleteRow(null);
      await autoSaveBaselineProjection({
        debts: nextDebts,
        successMessage: 'Debt deleted. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteInterestRate(rate) {
    const rateId = rateRecordId(rate);
    setLoading(true);
    try {
      await foundedApi.deleteInterestRate(rateId);
      const nextDebts = debts.map((debt) => ({
        ...debt,
        interest_rates: (debt.interest_rates || []).filter((item) => String(rateRecordId(item)) !== String(rateId)),
      }));
      setDebts(nextDebts);
      setPendingDeleteRateId(null);
      await autoSaveBaselineProjection({
        debts: nextDebts,
        successMessage: 'Interest rate entry deleted. Projection regenerated and saved.',
      });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteInterestRateQuietly(rateId) {
    try {
      await foundedApi.deleteInterestRate(rateId);
    } catch (error) {
      if (!String(error.message || '').includes('Interest rate not found')) {
        throw error;
      }
    }
  }

  async function generateProjection() {
    setLoading(true);
    try {
      setProjectionParams((params) => ({ ...params, startMonth: todayDate() }));
      const generated = await foundedApi.generateBaselineProjection({
        ...projectionParams,
        startMonth: currentMonthStart(),
        accountBalanceIds: accountBalances.map((item) => recordId(item)),
        incomeSourceIds: incomeSources.map((item) => incomeRecordId(item)),
        debtIds: debts.map((item) => recordId(item)),
      });
      setProjection({
        ...generated,
        assumptions_snapshot: buildSourceSnapshot(
          accountBalances,
          incomeSources,
          debts,
          generated.assumptions_snapshot
        ),
      });
      setStatus('Baseline projection generated.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveProjection() {
    if (!projectionTitle.trim()) {
      setStatus('Baseline Title is required.');
      return;
    }
    const assumptionsSnapshot = buildSourceSnapshot(
      accountBalances,
      incomeSources,
      debts,
      projection?.assumptions_snapshot
    );
    const generatedRows = projection?.generated_rows || [];
    setLoading(true);
    try {
      const saved = await foundedApi.saveProjection({
        title: projectionTitle,
        projectionType: 'baseline',
        notes: projectionNotes,
        assumptionsSnapshot,
        generatedRows,
      });
      setProjectionTitle(projectionTitle);
      setSelectedSavedProjectionId(String(recordId(saved)));
      setStatus(generatedRows.length ? 'Projection saved.' : 'Baseline source state saved.');
      await refreshSavedProjections();
      window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function openProjection(id) {
    setSelectedSavedProjectionId(id);
    setPendingDeleteProjectionId(null);
    setLoading(true);
    try {
      const opened = await foundedApi.getSavedProjection(id);
      let projectedPayoffDate = opened.assumptions_snapshot?._projection_summary?.projected_payoff_date || null;
      try {
        const dashboard = await foundedApi.getDashboardSummary(id);
        projectedPayoffDate = dashboard?.summary?.payoff_estimate || projectedPayoffDate;
      } catch {
        // Keep the saved projection usable even if dashboard summary metadata is unavailable.
      }
      const restored = restoreSourcesFromProjection(opened.assumptions_snapshot);
      setAccountBalances(restored.accountBalances);
      setIncomeSources(restored.incomeSources);
      setDebts(restored.debts);
      setProjection({
        assumptions_snapshot: opened.assumptions_snapshot,
        generated_rows: opened.generated_rows,
        summary: { projected_payoff_date: projectedPayoffDate },
      });
      setProjectionTitle(opened.title);
      setProjectionNotes(opened.notes || '');
      setProjectionParams((params) => ({ ...params, startMonth: todayDate() }));
      setStatus(`Opened ${opened.title}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProjection(item) {
    setLoading(true);
    try {
      await foundedApi.deleteSavedProjection(recordId(item));
      setSavedProjections((items) => items.filter((saved) => String(recordId(saved)) !== String(recordId(item))));
      window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
      if (String(selectedSavedProjectionId) === String(recordId(item))) {
        setSelectedSavedProjectionId('');
        setProjection(null);
        setProjectionTitle('');
        setProjectionNotes('');
      }
      setPendingDeleteProjectionId(null);
      setStatus('Saved projection deleted.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function newBaseline() {
    setSelectedSavedProjectionId('');
    setPendingDeleteProjectionId(null);
    setPendingDeleteRow(null);
    setPendingDeleteRateId(null);
    setAccountBalances([]);
    setIncomeSources([]);
    setDebts([]);
    setProjection(null);
    setProjectionTitle('');
    setProjectionNotes('');
    setProjectionParams({ startMonth: todayDate(), months: 60, endMonth: '' });
    setAccountBalanceForm({ ...initialAccountBalance, date: todayDate() });
    setIncomeForm({ ...initialIncome, startDate: todayDate() });
    setDebtForm(initialDebt);
    setDebtDateError('');
    setEditingAccountBalanceId(null);
    setEditingIncomeId(null);
    setEditingDebtId(null);
    setShowAccountBalanceForm(false);
    setShowIncomeForm(false);
    setShowDebtForm(false);
    setStatus('Started a new baseline.');
  }

  return (
    <div className="baseline-grid">
      <section className="card action-strip baseline-workflow-strip full">
        <div className="form-row baseline-date-controls">
          <label>Start Month<input type="date" value={todayDate()} disabled readOnly /></label>
          <label>Months<input type="number" min="1" max="300" value={projectionParams.months} onChange={(e) => setProjectionParams({ ...projectionParams, months: e.target.value })} /></label>
          <label>End Month<input type="date" value={projectionParams.endMonth} onChange={(e) => setProjectionParams({ ...projectionParams, endMonth: e.target.value })} /></label>
        </div>
        <div className="saved-loader-row baseline-save-controls">
          <label>
            Baseline Title
            <input placeholder="Title here" value={projectionTitle} onChange={(event) => setProjectionTitle(event.target.value)} />
          </label>
          <button className="outline-button" onClick={saveProjection} disabled={busy || !projectionTitle.trim()}>
            <Save size={16} /> Save
          </button>
          <label>
            Load Saved Projection
            <select value={selectedSavedProjectionId} onChange={(event) => event.target.value && openProjection(event.target.value)} disabled={busy}>
              <option value="">Select a saved baseline</option>
              {savedProjections.map((item) => (
                <option key={recordId(item)} value={recordId(item)}>{item.title} - {shortMonth(item.updated_at)}</option>
              ))}
            </select>
          </label>
          <div className="header-delete-slot baseline-delete-action">
            {selectedSavedProjection ? (
              String(pendingDeleteProjectionId) === String(recordId(selectedSavedProjection)) ? (
                <>
                  <button type="button" className="mini-confirm-button" onClick={() => deleteProjection(selectedSavedProjection)} disabled={busy}>
                    Confirm
                  </button>
                  <button type="button" className="icon-button table-action" onClick={() => setPendingDeleteProjectionId(null)} aria-label="Cancel delete">
                    x
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="icon-button table-action danger-action"
                  onClick={() => setPendingDeleteProjectionId(recordId(selectedSavedProjection))}
                  disabled={busy}
                  title="Delete selected baseline"
                  aria-label="Delete selected baseline"
                >
                  <Trash2 size={15} />
                </button>
              )
            ) : null}
          </div>
          <button className="outline-button" onClick={newBaseline} disabled={busy}>+ New</button>
        </div>
        <button className="primary-button" onClick={generateProjection} disabled={busy}>
          {busy ? 'Working...' : 'Generate Baseline'}
        </button>
      </section>

      <section className="card data-card">
        <div className="card-header">
          <h2>Income Sources</h2>
          <div className="header-actions">
            <button className="outline-button" onClick={startAddAccountBalance} disabled={busy} title={accountBalances.length >= MAX_ACCOUNT_BALANCES ? 'Maximum of 15 account balances reached.' : undefined}>
              <Plus size={16} /> Account Balance
            </button>
            <button className="outline-button" onClick={startAddIncome} disabled={busy} title={incomeSources.length >= MAX_INCOME_SOURCES ? 'Maximum of 15 income sources reached.' : undefined}>
              <Plus size={16} /> Income
            </button>
          </div>
        </div>
        <div className="subsection-title" data-baseline-section="account-balances">Account Balances</div>
        <CrudTable
          columns={['Bank', 'Account Type', 'Owner', 'Date', 'Amount', 'Update', 'Status', 'Actions']}
          sectionId="account-balances"
          onReorder={reorderAccountBalances}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={busy}
          rows={accountBalances.map((item) => ({
            id: recordId(item),
            cells: [
              item.name,
              item.account_type || '-',
              item.owner || '-',
              shortMonth(item.date),
              currencyPrecise(item.amount),
              <InlineAmountInput
                key={`balance-update-${recordId(item)}`}
                ariaLabel={`Update ${item.name || 'account'} amount`}
                value={item.amount}
                disabled={busy}
                onCommit={(value) => inlineUpdateAccountBalanceAmount(item, value)}
              />,
              item.active ? 'Active' : 'Inactive',
            ],
            onEdit: () => startEditAccountBalance(item),
            onDelete: () => deleteAccountBalance(item),
          }))}
          empty={<EmptyState compact title="No account balance yet" body="Add a starting cash position to carry into projections." />}
        />
        {showAccountBalanceForm && (
          <form className="inline-form account-balance-form" ref={accountBalanceFormRef} onSubmit={submitAccountBalance}>
            <div className="form-heading">
              <strong>{editingAccountBalanceId ? 'Edit Account Balance' : 'Add Account Balance'}</strong>
              <button type="button" className="icon-button" onClick={cancelAccountBalanceForm} aria-label="Cancel account balance form">
                <X size={16} />
              </button>
            </div>
            <label>Bank<input placeholder="Bank Name" value={accountBalanceForm.name} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, name: e.target.value })} required /></label>
            <label>Account Type<input placeholder="Type of Account" value={accountBalanceForm.accountType} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, accountType: e.target.value })} /></label>
            <label>Owner<input placeholder="Name" value={accountBalanceForm.owner} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, owner: e.target.value })} /></label>
            <label>Amount<input type="number" min="0" placeholder="0.00" value={accountBalanceForm.amount} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, amount: e.target.value })} required /></label>
            <label>Date<input type="date" value={accountBalanceForm.date} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, date: e.target.value })} required /></label>
            <label>Notes<input placeholder="Optional notes" value={accountBalanceForm.notes} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, notes: e.target.value })} /></label>
            <div className="form-actions-row">
              <button className="primary-button" disabled={busy}>{busy ? 'Processing...' : editingAccountBalanceId ? 'Update Balance' : 'Save Balance'}</button>
              <label className="checkbox-line">
                <input type="checkbox" checked={accountBalanceForm.active} onChange={(e) => setAccountBalanceForm({ ...accountBalanceForm, active: e.target.checked })} /> Active
              </label>
            </div>
          </form>
        )}
        <div className="subsection-title">Income Sources</div>
        <CrudTable
          columns={['Name', 'Account', 'Start Date', 'Amount', 'Frequency', 'Status', 'Actions']}
          sectionId="income-sources"
          onReorder={reorderIncomeSources}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={busy}
          rows={incomeSources.map((item) => ({
            id: incomeRecordId(item),
            cells: [
              item.label,
              item.is_account_transfer ? 'Account Transfer' : accountDisplayName(accountBalances.find((account) => Number(recordId(account)) === Number(incomeAccountSelectionId(item)))),
              shortMonth(item.start_date),
              currencyPrecise(item.amount),
              labelize(item.frequency),
              item.active ? 'Active' : 'Inactive',
            ],
            onEdit: () => startEditIncome(item),
            onDelete: () => deleteIncome(item),
          }))}
          empty={<EmptyState compact title="No income sources yet" body="Add income sources to include them in baseline projections." />}
        />
        {showIncomeForm && (
          <form className="inline-form income-source-form" ref={incomeFormRef} onSubmit={submitIncome}>
            <div className="form-heading">
              <strong>{editingIncomeId ? 'Edit Income Source' : 'Add Income Source'}</strong>
              <button type="button" className="icon-button" onClick={cancelIncomeForm} aria-label="Cancel income form">
                <X size={16} />
              </button>
            </div>
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
              </>
            ) : (
              <>
                <label>Account
                  <select value={incomeForm.accountBalanceId || ''} onChange={(e) => setIncomeForm({ ...incomeForm, accountBalanceId: e.target.value })}>
                    <option value="">Select account</option>
                    {accountOptionsFor(incomeForm.accountBalanceId).map((account) => <option key={recordId(account)} value={recordId(account)}>{accountDisplayName(account)}</option>)}
                  </select>
                </label>
                <label>Amount<input type="number" min="0" placeholder="0.00" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} required /></label>
              </>
            )}
            {incomeForm.isAccountTransfer ? (
              <label>Amount<input type="number" min="0" placeholder="0.00" value={incomeForm.amount} onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })} required /></label>
            ) : (
              <label>Recurring
                <select value={incomeForm.frequency} onChange={(e) => setIncomeForm({ ...incomeForm, frequency: e.target.value, endDate: e.target.value === 'one_time' ? '' : incomeForm.endDate })}>
                  <option value="one_time">One-Time</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi_weekly">Bi-weekly</option>
                  <option value="first_and_fifteenth">First and Fifteenth</option>
                </select>
              </label>
            )}
            <label>{isOneTimeIncome(incomeForm) ? 'Date' : 'Start Date'}<input type="date" value={incomeForm.startDate} onChange={(e) => setIncomeForm({ ...incomeForm, startDate: e.target.value })} required /></label>
            {!isOneTimeIncome(incomeForm) ? (
              <label>End Date<input type="date" value={incomeForm.endDate} onChange={(e) => setIncomeForm({ ...incomeForm, endDate: e.target.value })} /></label>
            ) : null}
            {incomeForm.isAccountTransfer ? (
              <label>Recurring
                <select value={incomeForm.frequency} onChange={(e) => setIncomeForm({ ...incomeForm, frequency: e.target.value, endDate: e.target.value === 'one_time' ? '' : incomeForm.endDate })}>
                  <option value="one_time">One-Time</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi_weekly">Bi-weekly</option>
                  <option value="first_and_fifteenth">First and Fifteenth</option>
                </select>
              </label>
            ) : null}
            <label className={incomeForm.isAccountTransfer ? 'wide-field income-notes-field' : 'full-row-field income-notes-field'}>Notes<textarea placeholder="Optional notes" value={incomeForm.notes} onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })} /></label>
            <div className="form-actions-row">
              <button className="primary-button" disabled={busy}>{busy ? 'Processing...' : editingIncomeId ? 'Update Income' : 'Save Income'}</button>
              <label className="checkbox-line">
                <input type="checkbox" checked={incomeForm.isAccountTransfer} onChange={(e) => setIncomeForm({ ...incomeForm, isAccountTransfer: e.target.checked, accountBalanceId: e.target.checked ? '' : incomeForm.accountBalanceId })} /> Account Transfer
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={incomeForm.active} onChange={(e) => setIncomeForm({ ...incomeForm, active: e.target.checked })} /> Active
              </label>
            </div>
          </form>
        )}
      </section>

      <section className="card data-card debts-data-card" data-baseline-section="debts">
        <div className="card-header">
          <h2>Debts</h2>
          <button className="outline-button" onClick={startAddDebt} disabled={busy} title={debts.length >= MAX_DEBTS ? 'Maximum of 25 debts reached.' : undefined}>
            <Plus size={16} /> Debt
          </button>
        </div>
        <CrudTable
          columns={['Debt Name', 'Type', 'Balance', 'Min Pay', 'Actual Payment', 'APR', 'Update', 'Actions']}
          sectionId="debts"
          onReorder={reorderDebts}
          pendingDeleteRow={pendingDeleteRow}
          onRequestDelete={setPendingDeleteRow}
          onCancelDelete={() => setPendingDeleteRow(null)}
          loading={busy}
          rows={debts.map((item) => ({
            id: recordId(item),
            cells: [
              item.name,
              labelize(item.debt_type),
              currencyPrecise(item.current_balance),
              currencyPrecise(item.minimum_monthly_payment),
              currencyPrecise(Number(item.minimum_monthly_payment || 0) + Number(item.planned_extra_payment || 0)),
              debtAprLabel(item),
              <InlineAmountInput
                key={`debt-update-${recordId(item)}`}
                ariaLabel={`Update ${item.name || 'debt'} balance`}
                value={item.debt_type === 'other' ? Number(item.minimum_monthly_payment || 0) + Number(item.planned_extra_payment || 0) : item.current_balance}
                disabled={busy}
                onCommit={(value) => inlineUpdateDebtBalance(item, value)}
              />,
            ],
            onEdit: () => startEditDebt(item),
            onDelete: () => deleteDebt(item),
          }))}
          empty={<EmptyState compact title="No debts yet" body="Add debts and APRs to generate payoff projections." />}
        />
        {showDebtForm && (
          <form className="inline-form debt-form" ref={debtFormRef} onSubmit={submitDebt}>
            <div className="form-heading">
              <strong>{editingDebtId ? 'Edit Debt' : 'Add Debt'}</strong>
              <button type="button" className="icon-button" onClick={cancelDebtForm} aria-label="Cancel debt form">
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
                    if (isOtherDebt(nextForm) || nextForm.paymentDate) setDebtDateError('');
                  }}>
                    {['credit_card', 'personal_loan', 'vehicle_loan', 'student_loan', 'other'].map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
                  </select>
                </label>
                {!isOtherDebt(debtForm) ? (
                  <label>Current Balance<input type="number" min="0" placeholder="0.00" value={debtForm.currentBalance} onChange={(e) => setDebtForm({ ...debtForm, currentBalance: e.target.value })} required /></label>
                ) : null}
                <label>Minimum Payment<input type="number" min="0" placeholder="0.00" value={debtForm.minimumMonthlyPayment} onChange={(e) => setDebtForm({ ...debtForm, minimumMonthlyPayment: e.target.value })} required={!isOtherDebt(debtForm)} /></label>
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
                  <label>Standard APR %<input type="number" min="0" step="0.01" placeholder="0.00" value={debtForm.aprPercentage} onChange={(e) => setDebtForm({ ...debtForm, aprPercentage: e.target.value })} /></label>
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
              <button className="primary-button" disabled={busy}>{busy ? 'Processing...' : editingDebtId ? 'Update Debt' : 'Save Debt'}</button>
              <label className="checkbox-line">
                <input type="checkbox" checked={debtForm.active} onChange={(e) => setDebtForm({ ...debtForm, active: e.target.checked })} /> Active
              </label>
            </div>
            {editingDebt ? (
              <InterestSchedule
                debt={editingDebt}
                onDeleteRate={deleteInterestRate}
                pendingDeleteRateId={pendingDeleteRateId}
                onRequestDeleteRate={setPendingDeleteRateId}
                onCancelDeleteRate={() => setPendingDeleteRateId(null)}
                loading={busy}
              />
            ) : (
              <p className="form-note">
                {isOtherDebt(debtForm)
                  ? 'Other debts are treated as recurring general obligations without APR or promo interest.'
                  : 'APR is optional. If left blank, projections assume 0%. Promo APR requires both promo dates.'}
              </p>
            )}
          </form>
        )}
      </section>

      <section className="card summary-stack">
        <h2>{rows[0]?.month ? `Summary - ${shortMonth(rows[0].month)}` : 'Summary'}</h2>
        <SummaryCard icon={CircleDollarSign} label="Total Monthly Income" value={currency(summary.income)} tone="positive" sublabel={rows.length ? null : 'Not projected yet'} />
        <SummaryCard icon={CreditCard} label="Total Monthly Debt Pay" value={currency(summary.payments)} tone="warning" sublabel={rows.length ? null : 'Not projected yet'} />
        <SummaryCard icon={ReceiptText} label="Bills" value={currency(rows[0]?.Bills || 0)} tone="warning" sublabel={rows.length ? null : 'Not projected yet'} />
        <SummaryCard icon={Landmark} label="Total Debt Balance" value={currency(summary.debt)} sublabel={rows.length ? null : 'Not projected yet'} />
        <SummaryCard icon={TrendingDown} label="Monthly Surplus" value={currency(summary.remainingCash)} tone={summary.remainingCash < 0 ? 'danger' : 'positive'} sublabel={rows.length ? null : 'Not projected yet'} />
        <SummaryCard icon={CalendarCheck} label="Projected Payoff Date" value={summary.payoff ? shortMonth(summary.payoff) : 'Not projected'} tone="scenario" />
      </section>

      {!rows.length ? (
        <section className="card table-card">
          <EmptyState title="No generated projection yet" body="Add or review income and debts, choose a date range, then generate a baseline projection." />
        </section>
      ) : null}

      {normalizedRows.length ? (
        <ProjectionTable
          rows={normalizedRows}
          preferredColumns={TABLE_COLUMN_VIEWS.projectionOverview.defaultColumns}
          initialVisibleCount={9}
          storageKey="founded.baseline.projectionOverview.v3"
        />
      ) : null}
      {status ? <div className="status-toast">{status}</div> : null}
    </div>
  );
}

function CrudTable({
  columns,
  rows,
  empty,
  onReorder,
  sectionId,
  pendingDeleteRow = null,
  onRequestDelete,
  onCancelDelete,
  loading = false,
}) {
  if (!rows.length) return <div className="mini-table-empty">{empty}</div>;
  const draggable = typeof onReorder === 'function' && rows.length > 1;
  const reorderType = 'application/x-founded-reorder';
  return (
    <div className="mini-table-wrap">
      <table className={`mini-table ${draggable ? 'reorderable-table' : ''}`}>
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
                activeBaselineDrag = { sectionId, rowId: row.id };
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(reorderType, JSON.stringify({ sectionId, rowId: row.id }));
                event.dataTransfer.setData('text/plain', JSON.stringify({ sectionId, rowId: row.id }));
                event.currentTarget.classList.add('dragging-row');
              }}
              onDragEnd={(event) => {
                activeBaselineDrag = null;
                event.currentTarget.classList.remove('dragging-row');
              }}
              onDragOver={(event) => {
                if (!draggable) return;
                const payload = activeBaselineDrag || parseReorderPayload(event.dataTransfer.getData('text/plain'));
                if (payload.sectionId !== sectionId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!draggable) return;
                const payload = activeBaselineDrag || parseReorderPayload(event.dataTransfer.getData(reorderType)) || parseReorderPayload(event.dataTransfer.getData('text/plain'));
                if (payload.sectionId !== sectionId) return;
                event.preventDefault();
                activeBaselineDrag = null;
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
                  onConfirm={row.onDelete}
                  onCancel={onCancelDelete}
                  onEdit={row.onEdit}
                  onRequestDelete={() => onRequestDelete?.({ sectionId, id: row.id })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

let activeBaselineDrag = null;

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

function InterestSchedule({
  debt,
  onDeleteRate,
  pendingDeleteRateId,
  onRequestDeleteRate,
  onCancelDeleteRate,
  loading,
}) {
  const rates = debt.interest_rates || [];
  return (
    <div className="interest-schedule">
      <div className="interest-schedule-header">
        <strong>Interest Schedule</strong>
        <span>{rates.length ? 'APR entries used by projections' : 'No APR entries; projections assume 0%'}</span>
      </div>
      {rates.length ? rates.map((rate) => {
        const rateId = rateRecordId(rate);
        return (
        <div className="rate-row" key={rateId}>
          <span>{percent(rate.apr_percentage)}</span>
          <span>{shortMonth(rate.start_date)} to {rate.end_date ? shortMonth(rate.end_date) : 'Indefinite'}</span>
          {String(pendingDeleteRateId) === String(rateId) ? (
            <span className="rate-row-actions">
              <button type="button" className="mini-confirm-button" onClick={() => onDeleteRate(rate)} disabled={loading}>
                Confirm
              </button>
              <button type="button" className="icon-button table-action" onClick={onCancelDeleteRate} disabled={loading} aria-label="Cancel APR delete">
                x
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="icon-button table-action danger-action"
              onClick={() => onRequestDeleteRate(rateId)}
              disabled={loading}
              title="Delete APR entry"
              aria-label="Delete APR entry"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        );
      }) : null}
      <p className="form-note">Editing APR fields updates the first APR entry. Add complex promo schedules in SEP 4.</p>
    </div>
  );
}

function rowValue(row, label) {
  const aliases = {
    Income: ['Income', 'income'],
    'Total Debt Payments': ['Total Debt Payments', 'total_debt_payments'],
    'Total Debt': ['Total Debt', 'total_debt'],
    'Monthly Surplus': ['Monthly Surplus', 'Remaining Cash', 'monthly_surplus', 'remaining_cash'],
  };
  return Number((aliases[label] || [label]).map((key) => row?.[key]).find((value) => value !== undefined && value !== null) || 0);
}

function monthlyIncomeAmount(source) {
  if (source.is_account_transfer || source.isAccountTransfer) return 0;
  const amount = Number(source.amount || 0);
  return amount;
}

function isOtherDebt(formOrDebt) {
  return formOrDebt?.debtType === 'other' || formOrDebt?.debt_type === 'other';
}

function isOneTimeOtherDebt(formOrDebt) {
  return isOtherDebt(formOrDebt) && (formOrDebt?.recurrence || 'monthly') === 'one_time';
}

async function fetchDebtWithRates(debtId, fallbackDebt = {}) {
  const [debt, rates] = await Promise.all([
    foundedApi.getDebt(debtId),
    foundedApi.listInterestRates(debtId),
  ]);
  return {
    ...debt,
    interest_rates: rates.length ? rates : fallbackDebt.interest_rates || [],
  };
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

function debtAprLabel(debt) {
  if (isOtherDebt(debt)) return labelize(debt.recurrence || 'monthly');
  return debt.interest_rates?.[0] ? percent(debt.interest_rates[0].apr_percentage) : '0%';
}

function buildSourceSnapshot(accountBalances = [], incomeSources = [], debts = [], baseSnapshot = {}) {
  const interestRates = debts.flatMap((debt) => debt.interest_rates || []);
  return {
    ...baseSnapshot,
    account_balances: withDisplayOrder(accountBalances),
    income_sources: withDisplayOrder(incomeSources),
    debts: withDisplayOrder(debts.map(({ interest_rates: _interestRates, ...debt }) => debt)),
    interest_rates: interestRates,
    _projection_summary: baseSnapshot._projection_summary || { projected_payoff_date: null },
  };
}

function restoreSourcesFromProjection(snapshot = {}) {
  const incomeSources = snapshot.income_sources || snapshot.baseline_assumptions?.income_sources || [];
  const debts = snapshot.debts || snapshot.baseline_assumptions?.debts || [];
  const interestRates = snapshot.interest_rates || snapshot.baseline_assumptions?.interest_rates || [];
  const accountBalances = snapshot.account_balances || snapshot.baseline_assumptions?.account_balances || [];
  return {
    accountBalances: sortByDisplayOrder(accountBalances),
    incomeSources: sortByDisplayOrder(incomeSources),
    debts: sortByDisplayOrder(debts).map((debt) => ({
      ...debt,
      interest_rates: interestRates.filter((rate) => (
        Number(rate.debt_id) === Number(recordId(debt))
        || Number(rate.legacy_debt_id) === Number(recordId(debt))
      )),
    })),
  };
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

export const baselineInstructions = {
  title: 'Instructions',
  sections: [
    { heading: '1. Add Income', body: 'Add all monthly income sources with start dates and optional end dates.' },
    { heading: '2. Edit Or Delete', body: 'Use the row action icons to keep existing income and debt records current.' },
    { heading: '3. Generate', body: 'Generate a baseline table using current backend income and debt records.' },
    { heading: '4. Save', body: 'Save useful baselines so Scenario Builder and Dashboard can reopen them later.' },
  ],
  tips: ['No APR is treated as 0%.', 'Seeded records can be edited or removed.', 'Projection results are estimates.'],
};
