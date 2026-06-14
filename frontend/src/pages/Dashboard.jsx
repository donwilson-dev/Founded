import React from 'react';
import {
  CalendarCheck,
  CircleDollarSign,
  CreditCard,
  Info,
  Landmark,
  ListChecks,
  ReceiptText,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { foundedApi } from '../api/foundedApi.js';
import ChartCard from '../components/ChartCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProjectionTable from '../components/ProjectionTable.jsx';
import { currency, currencyPrecise, labelize, percent, shortMonth, signedCurrencyPrecise } from '../utils/formatters.js';
import { useSessionState } from '../utils/persistence.js';
import { TABLE_COLUMN_VIEWS, columnLabel, normalizeProjectionRows } from '../utils/tableHelpers.js';

const colors = ['#2563eb', '#7c3aed', '#10b981', '#ef4444', '#14b8a6', '#f59e0b'];

export default function Dashboard({ onNavigate, isActive = false }) {
  const [saved, setSaved] = useState([]);
  const [projectionId, setProjectionId] = useSessionState('founded.dashboard.projectionId', '');
  const [dashboard, setDashboard] = useSessionState('founded.dashboard.summary', null);
  const [selectedProjection, setSelectedProjection] = useSessionState('founded.dashboard.selectedProjection', null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectionOwner, setProjectionOwner] = useState('overall');
  const [projectionAccount, setProjectionAccount] = useState('all');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [headerRoot, setHeaderRoot] = useState(null);

  useEffect(() => {
    setHeaderRoot(document.getElementById('topbar-actions'));
  }, []);

  async function refreshSavedProjections() {
    try {
      const items = await foundedApi.listSavedProjections();
      setSaved(items);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    refreshSavedProjections();
  }, []);

  useEffect(() => {
    if (!isActive) return;
    refreshSavedProjections();
    if (projectionId) loadDashboard(projectionId);
  }, [isActive, projectionId]);

  useEffect(() => {
    function handleSavedProjectionChange() {
      refreshSavedProjections();
    }
    window.addEventListener('founded:saved-projections-changed', handleSavedProjectionChange);
    return () => window.removeEventListener('founded:saved-projections-changed', handleSavedProjectionChange);
  }, []);

  useEffect(() => {
    if (!status) return undefined;
    const timeout = window.setTimeout(() => setStatus(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function loadDashboard(id) {
    setProjectionId(id);
    setPendingDeleteId(null);
    setProjectionOwner('overall');
    setProjectionAccount('all');
    if (!id) {
      setDashboard(null);
      setSelectedProjection(null);
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const [summaryData, projection] = await Promise.all([
        foundedApi.getDashboardSummary(id),
        foundedApi.getSavedProjection(id),
      ]);
      setDashboard(summaryData);
      setSelectedProjection(projection);
    } catch (error) {
      setStatus(error.message);
      setDashboard(null);
      setSelectedProjection(null);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProjection(item) {
    setLoading(true);
    try {
      await foundedApi.deleteSavedProjection(item.id);
      setSaved((items) => items.filter((savedItem) => savedItem.id !== item.id));
      window.dispatchEvent(new CustomEvent('founded:saved-projections-changed'));
      if (String(projectionId) === String(item.id)) {
        setProjectionId('');
        setDashboard(null);
        setSelectedProjection(null);
      }
      setPendingDeleteId(null);
      setStatus('Saved projection deleted.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function viewAllInputs(section = '') {
    if (projectionId) {
      window.sessionStorage.setItem('founded.baseline.openProjectionId', String(projectionId));
      if (section) window.sessionStorage.setItem('founded.baseline.focusSection', section);
      window.dispatchEvent(new CustomEvent('founded:open-baseline', { detail: { projectionId } }));
    }
    onNavigate('baseline');
  }

  function viewAllMilestones() {
    if (!projectionId || !selectedProjection) return;
    if (hasScenario) {
      window.sessionStorage.setItem('founded.scenario.openScenarioId', String(projectionId));
      window.dispatchEvent(new CustomEvent('founded:open-scenario', { detail: { scenarioId: projectionId } }));
      onNavigate('scenario');
      return;
    }
    window.sessionStorage.setItem('founded.baseline.openProjectionId', String(projectionId));
    window.dispatchEvent(new CustomEvent('founded:open-baseline', { detail: { projectionId } }));
    onNavigate('baseline');
  }

  const summary = dashboard?.summary || {};
  const snapshot = useMemo(() => projectionSnapshot(selectedProjection, summary), [selectedProjection, summary]);
  const hasScenario = Boolean(dashboard?.supports_scenario);
  const projectionRows = dashboard?.projection_rows || [];
  const displayProjectionRows = useMemo(
    () => normalizeDuplicateDebtProjectionRows(projectionRows, selectedProjection, hasScenario),
    [projectionRows, selectedProjection, hasScenario]
  );
  const normalizedProjectionRows = useMemo(() => normalizeProjectionRows(displayProjectionRows), [displayProjectionRows]);
  const ownerOptions = useMemo(() => ownerOptionsFromProjection(selectedProjection), [selectedProjection]);
  const effectiveProjectionOwner = hasScenario ? 'overall' : projectionOwner;
  const ownerSelected = !hasScenario && effectiveProjectionOwner !== 'overall';
  const accountOptions = useMemo(
    () => accountOptionsFromProjection(selectedProjection, effectiveProjectionOwner, hasScenario),
    [selectedProjection, effectiveProjectionOwner, hasScenario]
  );
  const accountSelected = projectionAccount !== 'all';
  const accountProjectionRows = useMemo(
    () => accountProjectionRowsForSelection(selectedProjection, projectionAccount, hasScenario, displayProjectionRows),
    [selectedProjection, projectionAccount, hasScenario, displayProjectionRows]
  );
  const accountSummary = useMemo(() => accountSummaryFromRows(accountProjectionRows), [accountProjectionRows]);
  const ownerFilteredProjectionRows = useMemo(() => {
    if (!ownerSelected) return normalizedProjectionRows;
    return normalizeProjectionRows(ownerProjectionRows(projectionRows, selectedProjection, effectiveProjectionOwner, false));
  }, [ownerSelected, effectiveProjectionOwner, normalizedProjectionRows, projectionRows, selectedProjection]);
  const tableProjectionRows = accountSelected ? accountProjectionRows : ownerFilteredProjectionRows;
  const chartRows = useMemo(() => {
    const sourceRows = ownerSelected ? ownerFilteredProjectionRows : normalizedProjectionRows;
    return totalDebtChartRows(sourceRows, hasScenario);
  }, [ownerSelected, ownerFilteredProjectionRows, normalizedProjectionRows, hasScenario]);
  const cashRows = useMemo(
    () => cashFlowRows(ownerSelected ? ownerFilteredProjectionRows : displayProjectionRows, hasScenario),
    [ownerSelected, ownerFilteredProjectionRows, displayProjectionRows, hasScenario]
  );
  const pieRows = ownerSelected
    ? debtBreakdownRows(ownerDebtBreakdown(selectedProjection, ownerFilteredProjectionRows, effectiveProjectionOwner, ''))
    : debtBreakdownRows(projectionDebtBreakdown(selectedProjection, normalizedProjectionRows, false) || dashboard?.datasets?.debt_breakdown_by_account || []);
  const scenarioPieRows = hasScenario
    ? ownerSelected
      ? debtBreakdownRows(ownerDebtBreakdown(selectedProjection, ownerFilteredProjectionRows, effectiveProjectionOwner, '+'))
      : debtBreakdownRows(projectionDebtBreakdown(selectedProjection, normalizedProjectionRows, true))
    : [];
  const insights = insightCards(dashboard);
  const milestones = useMemo(() => {
    const rawMilestones = ownerSelected
      ? ownerMilestones(dashboard?.datasets?.milestones || [], selectedProjection, effectiveProjectionOwner, false)
      : dashboard?.datasets?.milestones || milestoneRows(displayProjectionRows, hasScenario);
    return normalizeDashboardMilestones(rawMilestones, selectedProjection, hasScenario);
  }, [dashboard, ownerSelected, selectedProjection, effectiveProjectionOwner, displayProjectionRows, hasScenario]);
  const projectionTableColumns = useMemo(
    () => hasScenario ? scenarioProjectionColumns(normalizedProjectionRows) : TABLE_COLUMN_VIEWS.projectionOverview.defaultColumns,
    [hasScenario, normalizedProjectionRows]
  );
  const accountTableColumns = useMemo(
    () => accountProjectionColumns(accountProjectionRows),
    [accountProjectionRows]
  );
  const ownerTableColumns = useMemo(
    () => ownerProjectionColumns(ownerFilteredProjectionRows, false, selectedProjection, effectiveProjectionOwner),
    [ownerFilteredProjectionRows, selectedProjection, effectiveProjectionOwner]
  );
  const activeProjectionColumns = accountSelected ? accountTableColumns : ownerSelected ? ownerTableColumns : projectionTableColumns;
  const sampledChartRows = useMemo(() => annualChartRows(chartRows, 5), [chartRows]);
  const sampledCashRows = cashRows;
  const sampledInterestRows = useMemo(
    () => interestRows(ownerSelected ? ownerFilteredProjectionRows : displayProjectionRows, hasScenario),
    [ownerSelected, ownerFilteredProjectionRows, displayProjectionRows, hasScenario]
  );
  const hasDashboard = Boolean(dashboard);
  const showProjectionTable = hasDashboard && (tableProjectionRows.length || accountSelected);

  function exportDashboardProjection(format) {
    if (!selectedProjection) return;
    const exportPayload = {
      projection: selectedProjection,
      rows: tableProjectionRows,
      columns: activeProjectionColumns,
      hasScenario,
      accountSelected,
      ownerLabel: effectiveProjectionOwner === 'overall' ? 'Overall' : effectiveProjectionOwner,
      accountLabel: accountOptions.find((item) => item.value === projectionAccount)?.label || 'All Accounts',
    };
    if (format === 'csv') exportProjectionCsv(exportPayload);
    if (format === 'xlsx') exportProjectionXlsx(exportPayload);
    if (format === 'pdf') exportProjectionPdf(exportPayload);
  }

  useEffect(() => {
    if (hasScenario && projectionOwner !== 'overall') {
      setProjectionOwner('overall');
    }
  }, [hasScenario, projectionOwner]);

  useEffect(() => {
    if (hasScenario) return;
    if (projectionOwner !== 'overall' && !ownerOptions.includes(projectionOwner)) {
      setProjectionOwner('overall');
    }
  }, [hasScenario, ownerOptions, projectionOwner]);

  useEffect(() => {
    if (projectionAccount !== 'all' && !accountOptions.some((account) => account.value === projectionAccount)) {
      setProjectionAccount('all');
    }
  }, [accountOptions, projectionAccount]);

  const tooltipProps = {
    formatter: (value) => currency(value),
    contentStyle: {
      border: '1px solid #dce4f2',
      borderRadius: 8,
      boxShadow: '0 12px 30px rgba(17, 31, 66, 0.12)',
    },
  };

  return (
    <div className="dashboard-grid analytics-dashboard">
      {isActive && headerRoot ? createPortal(
        <SavedProjectionControl
          saved={saved}
          projectionId={projectionId}
          loading={loading}
          pendingDeleteId={pendingDeleteId}
          onLoad={loadDashboard}
          onDelete={deleteProjection}
          onPendingDelete={setPendingDeleteId}
        />,
        headerRoot
      ) : null}

      {!saved.length ? (
        <section className="card full">
          <EmptyState
            title="No saved projections yet"
            body="Generate and save a baseline in Baseline Builder to unlock dashboard analytics."
          />
        </section>
      ) : null}

      <section className="snapshot-grid full">
        <SnapshotTable
          title="Account Balances"
          columns={['Bank', 'Account Type', 'Owner', 'Date', 'Amount']}
          rows={snapshot.accountBalanceRows}
          emptyText="Select a projection to preview account balances."
          actionLabel="View All Account Balances"
          onAction={() => viewAllInputs('account-balances')}
        />
        <SnapshotTable
          title="Debts"
          columns={['Debt Name', 'Type', 'Balance', 'Min Pay', 'Actual Payment', 'APR']}
          rows={snapshot.debtRows}
          emptyText="Select a projection to preview debts."
          actionLabel="View All Debts"
          onAction={() => viewAllInputs('debts')}
        />
        <section className="card snapshot-card summary-snapshot">
          <h2>{snapshot.summary.startMonth ? `Summary - ${shortMonth(snapshot.summary.startMonth)}` : 'Summary'}</h2>
          <SnapshotMetric icon={CircleDollarSign} label="Total Monthly Income" value={currency(snapshot.summary.income)} tone="positive" />
          <SnapshotMetric icon={CreditCard} label="Total Monthly Debt Pay" value={currency(snapshot.summary.payments)} tone="warning" />
          <SnapshotMetric icon={ReceiptText} label="Bills" value={currency(snapshot.summary.bills)} tone="warning" />
          <SnapshotMetric icon={Landmark} label="Total Debt Balance" value={currency(snapshot.summary.debt)} />
          <SnapshotMetric icon={TrendingDown} label="Monthly Surplus" value={currency(snapshot.summary.remainingCash)} tone={snapshot.summary.remainingCash < 0 ? 'danger' : 'positive'} />
          <SnapshotMetric icon={CalendarCheck} label="Projected Payoff Date" value={formatMonth(snapshot.summary.payoff)} tone="scenario" />
        </section>
      </section>

      <section className="dashboard-analytics-row full">
        <section className="card insights-card">
          <div className="section-title-row compact-title">
            <h2>Key Insights</h2>
          </div>
          <div className="insight-grid">
            {insights.map((item) => (
              <Metric key={item.label} {...item} />
            ))}
          </div>
        </section>
      </section>

      <section className={`dashboard-chart-grid full ${hasScenario ? 'has-scenario' : ''}`}>
        <ChartCard
          title="Total Debt Over Time"
          info="Tracks projected debt balance changes over time."
          isEmpty={!hasDashboard || !sampledChartRows.length || (ownerSelected && !chartHasAnyValue(sampledChartRows, ['baselineDebt', 'scenarioDebt']))}
          emptyBody={ownerSelected ? 'No data available for selected owner.' : 'Select a saved projection to plot debt balance over time.'}
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={sampledChartRows} margin={{ top: 8, right: 34, bottom: 12, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
              <XAxis dataKey="month" interval={0} height={40} tickMargin={12} minTickGap={12} />
              <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}K`} width={62} tickMargin={10} />
              <Tooltip {...tooltipProps} />
              <Legend verticalAlign="top" align="center" height={28} iconType="square" />
              <Line dataKey="baselineDebt" name="Baseline" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
              {dashboard?.supports_scenario ? (
                <Line dataKey="scenarioDebt" name="Scenario+" stroke="#7c3aed" strokeWidth={3} strokeDasharray="7 5" dot={{ r: 3 }} />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Monthly Cash Flow"
          info="Displays projected income, debt payments, bills, and monthly surplus."
          isEmpty={!hasDashboard || !sampledCashRows.length || (ownerSelected && !chartHasAnyValue(sampledCashRows, ['income', 'debtPayments', 'bills', 'monthlySurplus']))}
          emptyBody={ownerSelected ? 'No data available for selected owner.' : 'Open a saved projection to compare monthly cash movement.'}
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sampledCashRows} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
              <XAxis dataKey="month" interval={0} />
              <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}K`} width={46} />
              <Tooltip {...tooltipProps} />
              <Legend verticalAlign="top" align="center" height={28} iconType="square" />
              <Bar dataKey="income" name="Income" fill="#10b981" />
              <Bar dataKey="debtPayments" name="Debt Payments" fill="#ef4444" />
              <Bar dataKey="bills" name="Bills" fill="#f59e0b" />
              <Bar dataKey="monthlySurplus" name="Monthly Surplus" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <MilestonesCard
          milestones={milestones}
          isScenario={hasScenario}
          isEmpty={!hasDashboard}
          onViewAll={viewAllMilestones}
        />

        <ChartCard
          title="Debt Breakdown"
          className="debt-breakdown-card"
          info="Shows how total debt is distributed across all active debts."
          isEmpty={!hasDashboard || !pieRows.length}
          emptyBody={ownerSelected ? 'No data available for selected owner.' : 'Debt share appears after a saved projection is selected.'}
        >
          <div className={`debt-breakdown-layout ${scenarioPieRows.length ? 'has-scenario' : ''}`}>
            <DebtDonut title="Baseline" rows={pieRows} total={pieRows.reduce((sum, row) => sum + row.value, 0)} tooltipProps={tooltipProps} />
            {scenarioPieRows.length ? (
              <DebtDonut title="Scenario+" rows={scenarioPieRows} total={scenarioPieRows.reduce((sum, row) => sum + row.value, 0)} tooltipProps={tooltipProps} />
            ) : null}
          </div>
        </ChartCard>

        <ChartCard
          title="Interest vs Principal Paid"
          info="Compares projected interest versus principal payments over time."
          isEmpty={!hasDashboard || !sampledInterestRows.length || (ownerSelected && !chartHasAnyValue(sampledInterestRows, ['interest', 'principal']))}
          emptyBody={ownerSelected ? 'No data available for selected owner.' : 'Interest and principal bars appear when projection rows are available.'}
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sampledInterestRows} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
              <XAxis dataKey="month" interval={0} />
              <YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}K`} width={46} />
              <Tooltip {...tooltipProps} />
              <Legend verticalAlign="top" align="center" height={28} iconType="square" />
              <Bar dataKey="interest" name="Interest" stackId="a" fill="#ef4444" />
              <Bar dataKey="principal" name="Principal" stackId="a" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {showProjectionTable ? (
        <>
        {accountSelected && accountSummary ? (
          <section className="card insights-card account-summary-card full">
            <div className="section-title-row compact-title">
              <h2>Account Summary</h2>
            </div>
            <div className="insight-grid account-insight-grid">
              <Metric label="Starting Balance" value={currency(accountSummary.startingBalance)} />
              <Metric label="Ending Balance" value={currency(accountSummary.endingBalance)} />
              <Metric label="Lowest Projected Balance" value={currency(accountSummary.lowestBalance)} />
              <Metric label="Highest Projected Balance" value={currency(accountSummary.highestBalance)} />
              <Metric
                label="Net Change"
                value={signedCurrencyPrecise(accountSummary.netChange)}
                tone={accountSummary.netChange < 0 ? 'danger' : accountSummary.netChange > 0 ? 'positive' : 'default'}
              />
            </div>
          </section>
        ) : null}
        <ProjectionTable
          rows={tableProjectionRows}
          preferredColumns={activeProjectionColumns}
          initialVisibleCount={9}
          storageKey={
            accountSelected
              ? 'founded.dashboard.accountProjectionOverview.v1'
              : hasScenario
                ? 'founded.dashboard.scenarioProjectionOverview.v4'
                : 'founded.dashboard.projectionOverview.v4'
          }
          ownerOptions={hasScenario ? null : ownerOptions}
          ownerValue={effectiveProjectionOwner}
          onOwnerChange={setProjectionOwner}
          accountOptions={accountOptions}
          accountValue={projectionAccount}
          onAccountChange={setProjectionAccount}
          exportOptions={[
            { value: 'csv', label: 'CSV' },
            { value: 'xlsx', label: 'Excel (.xlsx)' },
            { value: 'pdf', label: 'PDF (.pdf)' },
          ]}
          onExport={exportDashboardProjection}
          emptyText={accountSelected ? 'No account projection data available.' : undefined}
          visibilityResetKey={`${projectionId || 'none'}:${effectiveProjectionOwner}:${projectionAccount}:${hasScenario ? 'scenario' : 'baseline'}`}
        />
        </>
      ) : (
        <section className="card table-card">
          <EmptyState
            title={accountSelected ? 'No account projection data available.' : 'Projection overview waits here'}
            body={accountSelected ? 'Choose All Accounts or another account to review projection rows.' : 'Select a saved projection to review its month-by-month table.'}
          />
        </section>
      )}

      {status ? <div className="status-toast">{status}</div> : null}
    </div>
  );
}

function SavedProjectionControl({
  saved,
  projectionId,
  loading,
  pendingDeleteId,
  onLoad,
  onDelete,
  onPendingDelete,
}) {
  const selected = saved.find((item) => String(item.id) === String(projectionId));
  return (
    <div className="dashboard-header-control">
      <span
        className="info-tip saved-projection-help"
        aria-label="If the selected projection does not load correctly, regenerate and save the projection from the appropriate Builder page, then reload it from the Dashboard."
      >
        <Info size={14} />
        <span className="info-popover">If the selected projection does not load correctly, regenerate and save the projection from the appropriate Builder page, then reload it from the Dashboard.</span>
      </span>
      <label>
        Saved Projection
        <select value={projectionId} onChange={(event) => onLoad(event.target.value)}>
          <option value="">Select a saved projection</option>
          {saved.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} - {labelize(item.projection_type)}
            </option>
          ))}
        </select>
      </label>
      <div className="header-delete-slot">
        {selected ? (
          String(pendingDeleteId) === String(selected.id) ? (
            <>
              <button type="button" className="mini-confirm-button" onClick={() => onDelete(selected)} disabled={loading}>
                Confirm
              </button>
              <button type="button" className="icon-button table-action" onClick={() => onPendingDelete(null)} aria-label="Cancel delete">
                x
              </button>
            </>
          ) : (
            <button
              type="button"
              className="icon-button table-action danger-action"
              onClick={() => onPendingDelete(selected.id)}
              disabled={loading}
              title="Delete selected projection"
              aria-label={`Delete ${selected.title}`}
            >
              <Trash2 size={15} />
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

function SnapshotTable({ title, columns, rows, emptyText, actionLabel, onAction }) {
  const visibleRows = rows.slice(0, 5);
  return (
    <section className="card snapshot-card">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="snapshot-table-wrap">
          <table className="mini-table snapshot-table">
            <thead>
              <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="snapshot-empty">{emptyText}</div>
      )}
      <button type="button" className="snapshot-link" onClick={onAction} disabled={!rows.length}>
        {actionLabel}
      </button>
    </section>
  );
}

function SnapshotMetric({ icon: Icon, label, value, tone = 'default' }) {
  return (
    <div className="snapshot-metric">
      <Icon size={17} className={tone} />
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function MilestonesCard({ milestones, isScenario, isEmpty, onViewAll }) {
  const visibleMilestones = milestones.slice(0, 6);
  const hasMore = milestones.length > visibleMilestones.length || visibleMilestones.length === 6;
  return (
    <section className="card milestones-card">
      <div className="card-header">
        <div className="chart-title-row">
          <h2>Milestones</h2>
          <span className="info-tip" aria-label="Shows projected payoff milestones for the active dashboard view.">
            <Info size={14} />
            <span className="info-popover">Shows projected payoff milestones for the active dashboard view.</span>
          </span>
        </div>
      </div>
      <div className="milestone-list" aria-label={isScenario ? 'Scenario milestones' : 'Baseline milestones'}>
        {!isEmpty && visibleMilestones.length ? visibleMilestones.map((item, index) => (
            <div className={`milestone-item ${item.type}`} key={`${item.month}-${item.label}-${index}`}>
              <span className="milestone-card-icon" aria-hidden="true">
                <ListChecks size={15} />
              </span>
              <div>
                <MilestoneLabel label={item.label} />
                <span className="milestone-date">{shortMonth(item.month)}</span>
              </div>
            </div>
          )) : (
          <div className="milestone-empty">
            {isEmpty ? 'Select a saved projection to see milestones.' : 'No milestones available yet.'}
          </div>
        )}
      </div>
      {hasMore ? (
        <button type="button" className="snapshot-link milestones-link" onClick={onViewAll}>
          View All Milestones
        </button>
      ) : null}
    </section>
  );
}

function MilestoneLabel({ label }) {
  if (label.endsWith(' Paid Off')) {
    return (
      <strong className="milestone-title">
        <span className="milestone-debt-name">{label.replace(/ Paid Off$/, '')}</span>
        <span className="milestone-status"> Paid Off</span>
      </strong>
    );
  }
  return <strong className="milestone-title"><span className="milestone-debt-name">{label}</span></strong>;
}

function DebtDonut({ title, rows, total, tooltipProps }) {
  const legendColumns = splitLegendColumns(rows);

  return (
    <div className="debt-donut-group">
      <h3>{title}</h3>
      <div className="debt-donut-content">
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="chartName" innerRadius={42} outerRadius={62}>
                {rows.map((item, index) => (
                  <Cell key={item.chartName || `${item.name}-${index}`} fill={item.color} />
                ))}
              </Pie>
              <Tooltip {...tooltipProps} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <strong>{currency(total)}</strong>
            <span>Total Debt</span>
          </div>
        </div>
        <div className={`debt-legend-columns columns-${legendColumns.length}`}>
          {legendColumns.map((column, columnIndex) => (
            <div className="debt-legend-list" key={`${title}-legend-${columnIndex}`}>
              {column.map((item, index) => (
                <div className="debt-legend-item" key={`${item.name}-${columnIndex}-${index}`}>
                  <span style={{ background: item.color }} />
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.percent.toFixed(1)}% ({currency(item.value)})</small>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function splitLegendColumns(rows) {
  if (rows.length <= 3) return [rows];
  const midpoint = Math.ceil(rows.length / 2);
  return [rows.slice(0, midpoint), rows.slice(midpoint)].filter((column) => column.length);
}

function Metric({ label, value, sublabel, tone = 'default' }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      {sublabel ? <small>{sublabel}</small> : null}
    </div>
  );
}

function formatMonth(value) {
  return value ? shortMonth(value) : 'Not projected';
}

function sampleIndexes(length, target = 6) {
  if (length <= 0) return [];
  if (length <= target) return Array.from({ length }, (_, index) => index);
  const lastIndex = length - 1;
  const indexes = new Set();
  for (let index = 0; index < target; index += 1) {
    indexes.add(Math.round((index * lastIndex) / (target - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

function sampleChartRows(rows, target = 6) {
  return sampleIndexes(rows.length, target).map((index) => rows[index]);
}

function annualChartRows(rows, target = 5) {
  if (rows.length <= target) return rows;
  const annualRows = [];
  for (let index = 0; index < rows.length && annualRows.length < target; index += 12) {
    annualRows.push(rows[index]);
  }
  return annualRows.length >= 2 ? annualRows : sampleChartRows(rows, target);
}

function numberCell(row, key, fallbackKey = null) {
  return Number(row?.[key] ?? (fallbackKey ? row?.[fallbackKey] : 0) ?? 0);
}

function cashFlowRows(rows, hasScenario) {
  if (!hasScenario) {
    return rows.slice(0, 6).map((row) => cashFlowPoint(row, ''));
  }
  return rows.slice(0, 3).flatMap((row) => {
    return [cashFlowPoint(row, ''), cashFlowPoint(row, '+')];
  });
}

function cashFlowPoint(row, suffix) {
  const scenario = suffix === '+';
  return {
    month: `${shortMonth(row.month)}${suffix}`,
    income: numberCell(row, `Income${suffix}`, 'Income'),
    debtPayments: numberCell(row, `Total Debt Payments${suffix}`, 'Total Debt Payments'),
    bills: numberCell(row, `Bills${suffix}`, 'Bills'),
    monthlySurplus: scenario
      ? Number(row['Monthly Surplus+'] ?? row['Remaining Cash+'] ?? row['Monthly Surplus'] ?? row['Remaining Cash'] ?? 0)
      : Number(row['Monthly Surplus'] ?? row['Remaining Cash'] ?? 0),
  };
}

function interestRows(rows, hasScenario) {
  if (!hasScenario) {
    return rows.slice(0, 6).map((row) => interestPoint(row, ''));
  }
  return rows.slice(0, 3).flatMap((row) => {
    return [interestPoint(row, ''), interestPoint(row, '+')];
  });
}

function totalDebtChartRows(rows = [], hasScenario) {
  return rows
    .filter((row) => row?.month)
    .map((row) => ({
      month: shortMonth(row.month),
      baselineDebt: Number(row['Total Debt Balance'] ?? row['Total Debt'] ?? 0),
      scenarioDebt: hasScenario && (row['Total Debt Balance+'] !== undefined || row['Total Debt+'] !== undefined)
        ? Number(row['Total Debt Balance+'] ?? row['Total Debt+'])
        : undefined,
    }));
}

function debtBreakdownRows(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return rows
    .filter((row) => Number(row.value || 0) > 0)
    .map((row, index) => ({
      ...row,
      name: compactDebtLegendLabel(row.name || 'Debt'),
      color: colors[index % colors.length],
      chartName: `${row.name || 'Debt'} ${index + 1}`,
      percent: total ? (Number(row.value || 0) / total) * 100 : 0,
    }));
}

function ownerDebtOverTimeRows(rows, hasScenario) {
  return rows.map((row) => ({
    month: shortMonth(row.month),
    baselineDebt: Number(row['Total Debt Balance'] ?? row['Total Debt'] ?? 0),
    scenarioDebt: hasScenario ? Number(row['Total Debt Balance+'] ?? row['Total Debt+'] ?? 0) : undefined,
  }));
}

function ownerDebtBreakdown(selectedProjection, rows, owner, suffix) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const sourceAssumptions = suffix ? assumptions : assumptions.baseline_assumptions || assumptions;
  const accountBalances = assumptions.account_balances || assumptions.baseline_assumptions?.account_balances || [];
  const ownerAccountIds = ownerAccountIdSet(accountBalances, owner);
  const firstRow = rows.find((row) => row?.month) || {};
  return (sourceAssumptions.debts || [])
    .filter((debt) => debt.debt_type !== 'other')
    .filter((debt) => ownerAccountIds.has(String(debt.account_balance_id)))
    .map((debt) => {
      const name = debt._projection_label || debt.name || 'Debt';
      return {
        name: compactDebtLegendLabel(debt._projection_label || debtLegendName(debt)),
        value: Number((suffix ? firstRow[suffixKey(name, suffix)] : firstRow[name]) ?? 0),
      };
    })
    .filter((row) => row.value > 0);
}

function chartHasAnyValue(rows, keys) {
  return rows.some((row) => keys.some((key) => Number(row?.[key] || 0) !== 0));
}

function projectionDebtBreakdown(selectedProjection, rows = [], scenario = false) {
  if (!selectedProjection || !rows.length) return [];
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const sourceAssumptions = scenario ? assumptions : assumptions.baseline_assumptions || assumptions;
  const debts = sourceAssumptions.debts || [];
  const suffix = scenario ? '+' : '';
  const firstRow = rows.find((row) => row?.month) || {};
  return debts
    .filter((debt) => debt.active !== false && debt.debt_type !== 'other')
    .map((debt) => {
      const name = compactDebtLegendLabel(debt._projection_label || debtLegendName(debt));
      return {
        name,
        value: projectionDebtValue(firstRow, debt, suffix),
      };
    })
    .filter((row) => row.value > 0);
}

function projectionDebtValue(row = {}, debt = {}, suffix = '') {
  const candidates = [
    debt._projection_label,
    debt.name,
    debtLegendName(debt),
    compactDebtLegendLabel(debt._projection_label || debtLegendName(debt)),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const key = suffixKey(candidate, suffix);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return Number(row[key] || 0);
    }
  }
  const normalizedCandidates = new Set(candidates.map((candidate) => normalizeDebtLookupKey(candidate)));
  const matchedKey = Object.keys(row || {}).find((key) => {
    if (!suffix && key.endsWith('+')) return false;
    if (suffix && !key.endsWith(suffix)) return false;
    const baseKey = suffix ? key.slice(0, -suffix.length) : key;
    return normalizedCandidates.has(normalizeDebtLookupKey(baseKey));
  });
  return matchedKey ? Number(row[matchedKey] || 0) : 0;
}

function debtLegendName(debt = {}) {
  const name = String(debt.name || debt._projection_label || 'Debt').trim() || 'Debt';
  const type = abbreviatedDebtType(debt.debt_type);
  return type ? `${name} (${type})` : compactDebtLegendLabel(name);
}

function compactDebtLegendLabel(value = '') {
  const text = String(value || 'Debt').trim() || 'Debt';
  const match = text.match(/^(.*?)\s*\((.*?)\)(.*)$/);
  if (!match) return text;
  const [, rawName, rawDetail, rawSuffix] = match;
  const debtType = String(rawDetail || '').split('-')[0].trim();
  const abbreviation = abbreviatedDebtType(debtType);
  const suffix = String(rawSuffix || '').replace(/\s*-\s*[^#]+\/Mo/gi, '').trim();
  return abbreviation ? `${rawName.trim()} (${abbreviation})${suffix ? ` ${suffix}` : ''}` : text;
}

function abbreviatedDebtType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const labels = {
    credit_card: 'CC',
    vehicle_loan: 'VL',
    personal_loan: 'PL',
    student_loan: 'SL',
    other: 'OTH',
  };
  return labels[normalized] || '';
}

function ownerOptionsFromProjection(selectedProjection) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const accountBalances = assumptions.account_balances || assumptions.baseline_assumptions?.account_balances || [];
  return [...new Set(
    accountBalances
      .map((account) => String(account.owner || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function accountOptionsFromProjection(selectedProjection, owner = 'overall', hasScenario = false) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const accountBalances = assumptions.account_balances || assumptions.baseline_assumptions?.account_balances || [];
  const scenarioAccountIds = hasScenario ? scenarioDeviationAccountIds(selectedProjection) : null;
  return accountBalances
    .filter((account) => account?.id !== undefined && account?.id !== null)
    .filter((account) => owner === 'overall' || String(account.owner || '').trim() === owner)
    .filter((account) => !scenarioAccountIds || scenarioAccountIds.has(String(account.id)))
    .map((account) => ({
      value: String(account.id),
      label: accountDisplayLabel(account),
      owner: String(account.owner || '').trim(),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function accountDisplayLabel(account = {}) {
  const name = String(account.name || account.bank || `Account ${account.id || ''}`).trim() || 'Account';
  const type = String(account.account_type || '').trim();
  const owner = String(account.owner || '').trim();
  const base = type ? `${name} - ${type}` : name;
  return owner ? `${base} (${owner})` : base;
}

function dashboardExportSections({ projection, rows = [], columns = [], hasScenario }, options = {}) {
  const richExport = options.richExport === true;
  const assumptions = projection?.assumptions_snapshot || {};
  const baseline = assumptions.baseline_assumptions || assumptions;
  const accountLookup = accountLookupById(baseline.account_balances || assumptions.account_balances || []);
  const debtPaidOffLookup = debtPaidOffExportLookup(projection, hasScenario);
  const projectionHeaders = columns.map((column) => richExport ? exportProjectionHeader(column) : columnLabel(column));
  const sections = [];

  addCsvSection(
    sections,
    hasScenario ? 'Scenario Projection Overview' : 'Projection Overview',
    projectionHeaders,
    rows.map((row) => columns.map((column, index) => projectionExportValue(row?.[column], column, projectionHeaders[index], debtPaidOffLookup, richExport)))
  );

  addCsvSection(
    sections,
    'Account Balances',
    ['Bank', 'Account Type', 'Owner', 'Date', 'Amount', 'Status'],
    sortByDisplayOrder(baseline.account_balances || []).map((item) => [
      item.name || '',
      item.account_type || '',
      item.owner || '',
      item.date || '',
      item.amount ?? '',
      item.active === false ? 'Inactive' : 'Active',
    ])
  );

  addCsvSection(
    sections,
    'Income Sources',
    ['Name', 'Account', 'From Account', 'To Account', 'Start Date', 'End Date', 'Amount', 'Frequency', 'Status'],
    sortByDisplayOrder(baseline.income_sources || []).map((item) => incomeExportRow(item, accountLookup))
  );

  addCsvSection(
    sections,
    'Debts',
    ['Debt Name', 'Account', 'Type', 'Balance', 'Min Payment', 'Actual Payment', 'APR / Recurrence', 'Status'],
    sortByDisplayOrder(baseline.debts || []).map((item) => debtExportRow(item, baseline.interest_rates || [], accountLookup))
  );

  if (hasScenario) {
    const scenarioOverrides = scenarioOverridesForExport(assumptions);
    const scenarioAccountLookup = accountLookupById(assumptions.account_balances || baseline.account_balances || []);
    addCsvSection(
      sections,
      'Scenario Income Deviations',
      ['Name', 'Account', 'From Account', 'To Account', 'Start Date', 'End Date', 'Amount', 'Frequency', 'Status'],
      scenarioOverrides.income.map((item) => incomeExportRow(item, scenarioAccountLookup))
    );
    addCsvSection(
      sections,
      'Scenario Debt Deviations',
      ['Debt Name', 'Account', 'Type', 'Balance', 'Min Payment', 'Actual Payment', 'APR / Recurrence', 'Status'],
      scenarioOverrides.debts.map((item) => debtExportRow(item, assumptions.interest_rates || [], scenarioAccountLookup))
    );
  }

  return sections.map(([titleRow, headers, ...sectionRows]) => ({
    title: titleRow[0],
    headers,
    rows: sectionRows,
  }));
}

function exportProjectionCsv(payload) {
  const sections = dashboardExportSections(payload);
  const projection = payload.projection;
  const hasScenario = payload.hasScenario;
  const csv = sections.map((section) => {
    const csvRows = [[section.title], section.headers, ...section.rows];
    return csvRows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  }).join('\r\n\r\n');
  const filename = `${slugify(projection?.title || 'projection')}-${hasScenario ? 'scenario' : 'baseline'}.csv`;
  downloadTextFile(filename, csv, 'text/csv;charset=utf-8');
}

function exportProjectionXlsx(payload) {
  const sections = dashboardExportSections(payload, { richExport: true });
  const projection = payload.projection;
  const hasScenario = payload.hasScenario;
  const metadata = exportMetadataRows(payload);
  const usedSheetNames = new Map();
  const sheets = sections.map((section) => ({
    name: uniqueSheetName(section.title, usedSheetNames),
    rows: [[section.title], ...metadata, [], section.headers, ...section.rows],
    columnWidths: sectionColumnWidths(section),
    headerRowIndex: metadata.length + 2,
    mergeColumnCount: section.headers.length,
  }));
  const workbookFiles = xlsxFiles(sheets);
  const bytes = zipFiles(workbookFiles);
  const filename = `${slugify(projection?.title || 'projection')}-${hasScenario ? 'scenario' : 'baseline'}.xlsx`;
  downloadBinaryFile(filename, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function exportProjectionPdf(payload) {
  const sections = dashboardExportSections(payload, { richExport: true });
  const projection = payload.projection;
  const hasScenario = payload.hasScenario;
  const bytes = pdfFromSections({
    title: `${projection?.title || 'Projection'} ${hasScenario ? 'Scenario' : 'Baseline'} Export`,
    metadata: exportMetadataRows(payload).map((row) => row.join(': ')),
    sections,
  });
  const filename = `${slugify(projection?.title || 'projection')}-${hasScenario ? 'scenario' : 'baseline'}.pdf`;
  downloadBinaryFile(filename, bytes, 'application/pdf');
}

function addCsvSection(sections, title, headers, rows) {
  sections.push([[title], headers, ...(rows.length ? rows : [['No rows']] )]);
}

function exportMetadataRows({ projection, rows = [], hasScenario, ownerLabel, accountLabel }) {
  const firstMonth = rows.find((row) => row?.month)?.month;
  const lastMonth = [...rows].reverse().find((row) => row?.month)?.month;
  const range = firstMonth && lastMonth ? `${shortMonth(firstMonth)} to ${shortMonth(lastMonth)}` : 'All available rows';
  return [
    ['Projection', projection?.title || 'Projection'],
    ['Export Type', hasScenario ? 'Scenario' : 'Baseline'],
    ['Generated', new Date().toLocaleString()],
    ['Date Range', range],
    ['Owner Filter', ownerLabel || 'Overall'],
    ['Account Filter', accountLabel || 'All Accounts'],
  ];
}

function incomeExportRow(item = {}, accountLookup = new Map()) {
  const transfer = isAccountTransfer(item);
  return [
    item.label || '',
    transfer ? 'Account Transfer' : accountLookup.get(String(item.account_balance_id)) || '',
    transfer ? accountLookup.get(String(item.from_account_id ?? item.fromAccountId ?? '')) || '' : '',
    transfer ? accountLookup.get(String(item.to_account_id ?? item.toAccountId ?? '')) || '' : '',
    item.start_date || item.startDate || '',
    item.end_date || item.endDate || '',
    item.amount ?? '',
    labelize(item.frequency || 'monthly'),
    item.active === false ? 'Inactive' : 'Active',
  ];
}

function debtExportRow(item = {}, rates = [], accountLookup = new Map()) {
  const actualPayment = Number(item.minimum_monthly_payment || 0) + Number(item.planned_extra_payment || 0);
  const regularRate = rates.find((rate) => String(rate.debt_id) === String(item.id) && !rate.end_date) ||
    rates.find((rate) => String(rate.debt_id) === String(item.id));
  return [
    item.name || '',
    accountLookup.get(String(item.account_balance_id)) || '',
    labelize(item.debt_type || ''),
    item.current_balance ?? '',
    item.minimum_monthly_payment ?? '',
    actualPayment,
    item.debt_type === 'other' ? labelize(item.recurrence || 'monthly') : (regularRate ? `${regularRate.apr_percentage}%` : '0%'),
    item.active === false ? 'Inactive' : 'Active',
  ];
}

function debtPaidOffExportLookup(projection, hasScenario) {
  const assumptions = projection?.assumptions_snapshot || {};
  const baseline = assumptions.baseline_assumptions || assumptions;
  const debts = [
    ...(baseline.debts || []),
    ...(hasScenario ? assumptions.debts || [] : []),
  ];
  const entries = new Map();
  debts.forEach((debt) => {
    const label = debtPaidOffExportLabel(debt);
    [
      debt.name,
      debt._projection_label,
      debtLegendName(debt),
      compactDebtLegendLabel(debt._projection_label || debtLegendName(debt)),
    ].filter(Boolean).forEach((key) => {
      entries.set(normalizeDebtLookupKey(key), label);
    });
  });
  return entries;
}

function debtPaidOffExportLabel(debt = {}) {
  const name = baseDebtName(debt.name || debt._projection_label || 'Debt');
  const type = abbreviatedDebtType(debt.debt_type);
  const actualPayment = Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0);
  const details = [
    type,
    actualPayment > 0 ? `${compactCurrency(actualPayment)}/mo` : '',
  ].filter(Boolean);
  return details.length ? `${name} (${details.join(', ')})` : name;
}

function baseDebtName(value = '') {
  return String(value || 'Debt').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'Debt';
}

function compactCurrency(value) {
  const amount = Number(value || 0);
  return amount % 1 === 0 ? currency(amount).replace('.00', '') : currencyPrecise(amount);
}

function normalizeDebtLookupKey(value = '') {
  return compactDebtLegendLabel(String(value || '')).toLowerCase().replace(/\s+/g, ' ').trim();
}

function debtLookupKey(value = '') {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeDuplicateDebtProjectionRows(rows = [], selectedProjection, hasScenario) {
  const context = duplicateDebtLabelContext(selectedProjection, hasScenario);
  if (!context.hasDuplicates) return rows;
  return rows.map((row) => {
    const next = {};
    const paidOffUsage = new Map();
    Object.entries(row || {}).forEach(([key, value]) => {
      const nextKey = normalizeDuplicateDebtColumnKey(key, row, next, context);
      const nextValue = (key === 'Debts Paid Off' || key === 'Debts Paid Off+') && Array.isArray(value)
        ? value.map((name) => resolveDuplicateDebtName(name, context, paidOffUsage))
        : value;
      if (Object.prototype.hasOwnProperty.call(next, nextKey) && nextKey !== key) return;
      next[nextKey] = nextValue;
    });
    return next;
  });
}

function normalizeDashboardMilestones(milestones = [], selectedProjection, hasScenario) {
  const context = duplicateDebtLabelContext(selectedProjection, hasScenario);
  if (!context.hasDuplicates) return milestones;
  const usage = new Map();
  return milestones.map((item) => ({
    ...item,
    label: normalizeMilestoneDebtLabel(item.label, context, usage),
  }));
}

function normalizeMilestoneDebtLabel(label = '', context, usage) {
  if (!String(label).endsWith(' Paid Off')) return label;
  const debtName = String(label).replace(/ Paid Off$/, '');
  return `${resolveDuplicateDebtName(debtName, context, usage)} Paid Off`;
}

function normalizeDuplicateDebtColumnKey(key, row, nextRow, context) {
  const plusSuffix = key.endsWith('+') ? '+' : '';
  const baseKey = plusSuffix ? key.slice(0, -1) : key;
  const metricSuffixes = [' Payment', ' Interest', ' Principal', ' Bill'];
  const metricSuffix = metricSuffixes.find((suffix) => baseKey.endsWith(suffix)) || '';
  const debtPart = metricSuffix ? baseKey.slice(0, -metricSuffix.length) : baseKey;
  const label = resolveDuplicateDebtColumnLabel(debtPart, metricSuffix, plusSuffix, row, nextRow, context);
  return label ? `${label}${metricSuffix}${plusSuffix}` : key;
}

function resolveDuplicateDebtColumnLabel(debtName, metricSuffix, plusSuffix, row, nextRow, context) {
  const exact = context.exactLookup.get(debtLookupKey(debtName));
  if (exact && debtLookupKey(debtName) !== debtLookupKey(baseDebtName(debtName))) return exact;
  const baseName = baseDebtName(debtName);
  const targets = context.labelsByBaseName.get(debtLookupKey(baseName)) || [];
  if (!targets.length) return exact || null;
  if (debtLookupKey(debtName) !== debtLookupKey(baseName)) return exact || targets[0];
  return targets.find((label) => {
    const key = `${label}${metricSuffix}${plusSuffix}`;
    return !Object.prototype.hasOwnProperty.call(row || {}, key) && !Object.prototype.hasOwnProperty.call(nextRow || {}, key);
  }) || targets[0];
}

function resolveDuplicateDebtName(name, context, usage) {
  const baseName = baseDebtName(name);
  const targets = context.labelsByBaseName.get(debtLookupKey(baseName)) || [];
  if (targets.length && debtLookupKey(name) === debtLookupKey(baseName)) {
    const count = usage.get(debtLookupKey(baseName)) || 0;
    usage.set(debtLookupKey(baseName), count + 1);
    return targets[Math.min(count, targets.length - 1)];
  }
  return context.exactLookup.get(debtLookupKey(name)) || name;
}

function duplicateDebtLabelContext(selectedProjection, hasScenario) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const baseline = assumptions.baseline_assumptions || assumptions;
  const groups = [baseline.debts || []];
  if (hasScenario) groups.push(assumptions.debts || []);
  const exactLookup = new Map();
  const identityLookup = new Map();
  const labelsByBaseName = new Map();
  let hasDuplicates = false;

  groups.forEach((debts = []) => {
    const counts = debts.reduce((map, debt) => {
      const key = debtLookupKey(baseDebtName(debt?.name || debt?._projection_label || 'Debt'));
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map());
    const usedLabels = new Set();
    debts.forEach((debt, index) => {
      const baseName = baseDebtName(debt?.name || debt?._projection_label || 'Debt');
      const baseKey = debtLookupKey(baseName);
      if ((counts.get(baseKey) || 0) <= 1) return;
      hasDuplicates = true;
      const label = duplicateDebtDisplayLabel(debt, index, usedLabels);
      const labels = labelsByBaseName.get(baseKey) || [];
      if (!labels.includes(label)) labels.push(label);
      labelsByBaseName.set(baseKey, labels);
      identityLookup.set(debtDisplayIdentity(debt, index), label);
      [
        debt.name,
        debt._projection_label,
        debtLegendName(debt),
        compactDebtLegendLabel(debt._projection_label || debtLegendName(debt)),
        baseName,
      ].filter(Boolean).forEach((candidate) => {
        const key = debtLookupKey(candidate);
        if (!exactLookup.has(key)) exactLookup.set(key, label);
      });
    });
  });

  return { exactLookup, identityLookup, labelsByBaseName, hasDuplicates };
}

function duplicateDebtDisplayLabel(debt = {}, index, usedLabels) {
  const name = baseDebtName(debt.name || debt._projection_label || 'Debt');
  const type = labelize(debt.debt_type || 'debt');
  const actualPayment = Number(
    debt.actual_monthly_payment ??
    debt.actualPayment ??
    debt.actual_payment ??
    (Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0))
  );
  let label = `${name} (${type} - ${compactCurrency(actualPayment)}/mo)`;
  if (usedLabels.has(label)) {
    label = `${label} #${debtDisplayIdentitySuffix(debt, index)}`;
  }
  usedLabels.add(label);
  return label;
}

function debtDisplayIdentity(debt = {}, index) {
  if (debt.id !== null && debt.id !== undefined) return `id:${debt.id}`;
  if (debt.legacyId !== null && debt.legacyId !== undefined) return `legacy:${debt.legacyId}`;
  if (debt._id !== null && debt._id !== undefined) return `mongo:${debt._id}`;
  return `position:${index}`;
}

function debtDisplayIdentitySuffix(debt = {}, index) {
  return debt.id ?? debt.legacyId ?? debt._id ?? index + 1;
}

function scenarioOverridesForExport(assumptions = {}) {
  const explicit = assumptions.scenario_overrides || {};
  if (explicit.income_overrides || explicit.debt_overrides) {
    return {
      income: sortByDisplayOrder(explicit.income_overrides || []),
      debts: sortByDisplayOrder(explicit.debt_overrides || []),
    };
  }
  const baseline = assumptions.baseline_assumptions || {};
  return {
    income: sortByDisplayOrder(assumptions.income_sources || [])
      .filter((item) => sourceDiffersFromBaseline(item, baseline.income_sources || [], 'label', comparableIncomeSource)),
    debts: sortByDisplayOrder(assumptions.debts || [])
      .filter((item) => sourceDiffersFromBaseline(item, baseline.debts || [], 'name', comparableDebtSource)),
  };
}

function accountLookupById(accounts = []) {
  return new Map(sortByDisplayOrder(accounts).map((account) => [String(account.id), accountDisplayLabel(account)]));
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

function csvDisplayValue(value, column) {
  if (Array.isArray(value)) return value.join('; ');
  if (column === 'month' && value) return shortMonth(value);
  return value ?? '';
}

function projectionExportValue(value, column, header, debtPaidOffLookup, richExport) {
  if (richExport && isDebtPaidOffHeader(header) && Array.isArray(value)) {
    return value.map((item) => debtPaidOffLookup.get(normalizeDebtLookupKey(item)) || String(item || '')).filter(Boolean).join('; ');
  }
  return csvDisplayValue(value, column);
}

function exportProjectionHeader(column) {
  const label = columnLabel(column);
  return label
    .replace(/^Total Debt Payments(\+)?$/, 'Debt Payments$1')
    .replace(/^Total Debt Balance(\+)?$/, 'Debt Balance$1');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeSheetName(value = 'Sheet') {
  const text = String(value || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet';
  return text.slice(0, 31);
}

function uniqueSheetName(value, usedNames) {
  const base = safeSheetName(value);
  const count = usedNames.get(base) || 0;
  usedNames.set(base, count + 1);
  if (!count) return base;
  const suffix = ` ${count + 1}`;
  return `${base.slice(0, 31 - suffix.length)}${suffix}`;
}

function xlsxFiles(sheets) {
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join('');
  const workbookRelationships = sheets.map((sheet, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join('');
  const sheetOverrides = sheets.map((sheet, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');

  return [
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`,
    },
    {
      path: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      path: 'xl/styles.xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="$#,##0.00;[Red]-$#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="+$#,##0.00;[Red]-$#,##0.00;$0.00"/></numFmts><fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF08265C"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF059669"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFEF4444"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF52617A"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF08265C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFDCE4F2"/></left><right style="thin"><color rgb="FFDCE4F2"/></right><top style="thin"><color rgb="FFDCE4F2"/></top><bottom style="thin"><color rgb="FFDCE4F2"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="166" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="166" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs></styleSheet>',
    },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: sheetXml(sheet),
    })),
  ];
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const widths = sheet.columnWidths || [];
  const headerRowIndex = sheet.headerRowIndex ?? 2;
  const headers = rows[headerRowIndex] || [];
  const cols = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      return xlsxCell(ref, cell, headers[columnIndex], rowIndex, headerRowIndex);
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const mergeCount = sheet.mergeColumnCount || headers.length;
  const mergeCells = mergeCount > 1 ? `<mergeCells count="1"><mergeCell ref="A1:${columnName(mergeCount)}1"/></mergeCells>` : '';
  const frozenRow = headerRowIndex + 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${frozenRow}" topLeftCell="A${frozenRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData>${mergeCells}</worksheet>`;
}

function xlsxCell(ref, value, header, rowIndex, headerRowIndex) {
  if (rowIndex === 0) {
    return `<c r="${ref}" s="5" t="inlineStr"><is><t>${escapeXml(value ?? '')}</t></is></c>`;
  }
  if (rowIndex > 0 && rowIndex < headerRowIndex - 1) {
    const style = ref.startsWith('A') ? 8 : 9;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value ?? '')}</t></is></c>`;
  }
  if (rowIndex === headerRowIndex) {
    return `<c r="${ref}" s="1" t="inlineStr"><is><t>${escapeXml(value ?? '')}</t></is></c>`;
  }
  const numeric = normalizedExportNumber(value, header);
  if (numeric) {
    const style = xlsxNumericStyle(numeric, header);
    return `<c r="${ref}" s="${style}"><v>${numeric.value}</v></c>`;
  }
  return `<c r="${ref}" s="4" t="inlineStr"><is><t>${escapeXml(formatExportDisplay(value, header))}</t></is></c>`;
}

function xlsxNumericStyle(numeric, header) {
  if (numeric.kind === 'percent') return 3;
  if (isMonthlySurplusHeader(header)) return numeric.value < 0 ? 7 : numeric.value > 0 ? 6 : 2;
  if (isCashBalanceHeader(header) && numeric.value < 0) return 7;
  return numeric.kind === 'money' ? 2 : 4;
}

function sectionColumnWidths(section) {
  return section.headers.map((header, columnIndex) => {
    const values = section.rows.map((row) => formatExportDisplay(row[columnIndex], header));
    const maxLength = [header, ...values].reduce((max, value) => Math.max(max, String(value ?? '').length), 0);
    return Math.min(34, Math.max(12, Math.ceil(maxLength * 1.12)));
  });
}

function normalizedExportNumber(value, header) {
  if (value === null || value === undefined || value === '') return null;
  if (isPercentHeader(header)) {
    const parsedPercent = parsePercentValue(value);
    return Number.isFinite(parsedPercent) ? { value: roundForExport(parsedPercent / 100, 6), kind: 'percent' } : null;
  }
  const parsed = parseNumberValue(value);
  if (!Number.isFinite(parsed)) return null;
  if (isMoneyHeader(header)) return { value: roundForExport(parsed, 2), kind: 'money' };
  if (isPlainNumericHeader(header)) return { value: roundForExport(parsed, 2), kind: 'number' };
  return null;
}

function formatExportDisplay(value, header) {
  if (value === null || value === undefined || value === '') return '';
  if (isPercentHeader(header)) {
    const parsedPercent = parsePercentValue(value);
    return Number.isFinite(parsedPercent) ? `${roundForExport(parsedPercent, 2).toFixed(2)}%` : String(value);
  }
  const parsed = parseNumberValue(value);
  if (Number.isFinite(parsed) && isMonthlySurplusHeader(header)) return signedCurrencyPrecise(roundForExport(parsed, 2));
  if (Number.isFinite(parsed) && isMoneyHeader(header)) return currencyPrecise(roundForExport(parsed, 2));
  if (Number.isFinite(parsed) && isPlainNumericHeader(header)) return String(roundForExport(parsed, 2));
  return String(value);
}

function parseNumberValue(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '').replace(/[$,%\s,]/g, '');
  if (!cleaned || cleaned === '-') return Number.NaN;
  return Number(cleaned);
}

function parsePercentValue(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  const cleaned = text.replace(/[%\s,]/g, '');
  if (!cleaned || cleaned === '-') return Number.NaN;
  return Number(cleaned);
}

function isMoneyHeader(header = '') {
  const text = String(header).toLowerCase();
  return /(income|payment|pay\.|bills|interest|principal|balance|amount|surplus|cash|debt)/.test(text)
    && !/(debt name|debts paid off|type|status|frequency|date|month|apr)/.test(text);
}

function isPercentHeader(header = '') {
  return /apr|percent|rate/i.test(String(header));
}

function isPlainNumericHeader(header = '') {
  return /months/i.test(String(header));
}

function isMonthlySurplusHeader(header = '') {
  return /monthly surplus/i.test(String(header));
}

function isCashBalanceHeader(header = '') {
  return /cash balance/i.test(String(header));
}

function isDebtPaidOffHeader(header = '') {
  return /debts? paid off/i.test(String(header));
}

function roundForExport(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function columnName(index) {
  let name = '';
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function zipFiles(files) {
  const encoder = new TextEncoder();
  const entries = files.map((file) => ({
    ...file,
    nameBytes: encoder.encode(file.path),
    data: typeof file.content === 'string' ? encoder.encode(file.content) : file.content,
  }));
  const chunks = [];
  const centralChunks = [];
  let offset = 0;

  entries.forEach((entry) => {
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + entry.nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, entry.nameBytes.length, true);
    local.set(entry.nameBytes, 30);
    chunks.push(local, entry.data);

    const central = new Uint8Array(46 + entry.nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, entry.nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(entry.nameBytes, 46);
    centralChunks.push(central);
    offset += local.length + entry.data.length;
  });

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concatUint8Arrays([...chunks, ...centralChunks, end]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let current = index;
  for (let bit = 0; bit < 8; bit += 1) {
    current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((array) => {
    result.set(array, offset);
    offset += array.length;
  });
  return result;
}

function pdfFromSections({ title, metadata = [], sections }) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 30;
  const contentWidth = pageWidth - margin * 2;
  const rowHeight = 18;
  const headerHeight = 20;
  const pages = [];
  let commands = [];
  let cursorY = pageHeight - margin;

  function addPage() {
    if (commands.length) pages.push(commands.join('\n'));
    commands = [];
    cursorY = pageHeight - margin;
  }

  function ensureSpace(height) {
    if (cursorY - height < margin) addPage();
  }

  drawCenteredText(commands, title, pageWidth / 2, cursorY, 16, 'F2');
  cursorY -= 20;
  metadata.forEach((line) => {
    drawCenteredText(commands, line, pageWidth / 2, cursorY, 9, 'F1', 'muted');
    cursorY -= 12;
  });
  cursorY -= 18;

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex) cursorY -= 12;
    ensureSpace(72);
    drawCenteredText(commands, section.title, pageWidth / 2, cursorY, 13, 'F2');
    cursorY -= 22;
    const widths = pdfColumnWidths(section, contentWidth);
    drawPdfTableHeader(commands, section.headers, widths, margin, cursorY, headerHeight);
    cursorY -= headerHeight;
    const rows = section.rows.length ? section.rows : [['No rows']];
    rows.forEach((row) => {
      const rowLines = pdfRowLines(row, section.headers, widths, 7);
      const dynamicRowHeight = Math.max(rowHeight, maxLineCount(rowLines) * 8 + 10);
      ensureSpace(dynamicRowHeight);
      if (cursorY === pageHeight - margin) {
        drawCenteredText(commands, section.title, pageWidth / 2, cursorY, 13, 'F2');
        cursorY -= 22;
        drawPdfTableHeader(commands, section.headers, widths, margin, cursorY, headerHeight);
        cursorY -= headerHeight;
      }
      drawPdfTableRow(commands, row, section.headers, widths, margin, cursorY, dynamicRowHeight, rowLines);
      cursorY -= dynamicRowHeight;
    });
    cursorY -= 14;
  });
  if (commands.length) pages.push(commands.join('\n'));

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };
  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const encoder = new TextEncoder();
  const pageIds = pages.map((pageCommands) => {
    const contentId = addObject(`<< /Length ${encoder.encode(pageCommands).length} >>\nstream\n${pageCommands}\nendstream`);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentId} 0 R >>`);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const chunks = [`%PDF-1.4\n%${String.fromCharCode(226, 227, 207, 211)}\n`];
  const offsets = [0];
  let byteOffset = encoder.encode(chunks[0]).length;
  objects.forEach((object, index) => {
    offsets.push(byteOffset);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    byteOffset += encoder.encode(chunk).length;
  });
  const xrefOffset = byteOffset;
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((offsetValue) => `${String(offsetValue).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
  ].join('\n');
  chunks.push(xref);
  return encoder.encode(chunks.join(''));
}

function drawPdfTableHeader(commands, headers, widths, x, yTop, height) {
  drawRect(commands, x, yTop - height, widths.reduce((sum, width) => sum + width, 0), height, true);
  let cursorX = x;
  headers.forEach((header, index) => {
    drawCellBorder(commands, cursorX, yTop - height, widths[index], height);
    drawCenteredText(commands, truncateForWidth(header, widths[index], 7), cursorX + widths[index] / 2, yTop - 13, 7, 'F2', 'white');
    cursorX += widths[index];
  });
}

function drawPdfTableRow(commands, row, headers, widths, x, yTop, height, rowLines = null) {
  let cursorX = x;
  widths.forEach((width, index) => {
    const lines = rowLines?.[index] || wrapPdfText(formatExportDisplay(row[index], headers[index]), width, 7);
    const tone = pdfCellTone(row[index], headers[index]);
    const font = tone ? 'F2' : 'F1';
    drawCellBorder(commands, cursorX, yTop - height, width, height);
    lines.forEach((line, lineIndex) => {
      drawCenteredText(commands, line, cursorX + width / 2, yTop - 12 - (lineIndex * 8), 7, font, tone || 'default');
    });
    cursorX += width;
  });
}

function pdfCellTone(value, header) {
  const parsed = parseNumberValue(value);
  if (!Number.isFinite(parsed)) return '';
  if (isMonthlySurplusHeader(header)) return parsed < 0 ? 'negative' : parsed > 0 ? 'positive' : '';
  if (isCashBalanceHeader(header) && parsed < 0) return 'negative';
  return '';
}

function pdfColumnWidths(section, contentWidth) {
  const weights = section.headers.map((header, index) => {
    const sample = section.rows.slice(0, 25).map((row) => formatExportDisplay(row[index], header));
    const maxLength = [header, ...sample].reduce((max, value) => Math.max(max, String(value ?? '').length), 0);
    return Math.max(8, Math.min(24, maxLength));
  });
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return weights.map((weight) => (weight / total) * contentWidth);
}

function pdfRowLines(row, headers, widths, fontSize) {
  return widths.map((width, index) => wrapPdfText(formatExportDisplay(row[index], headers[index]), width, fontSize));
}

function maxLineCount(rowLines = []) {
  return rowLines.reduce((max, lines) => Math.max(max, lines.length), 1);
}

function wrapPdfText(value, width, fontSize) {
  const text = String(value ?? '');
  if (!text) return [''];
  const maxChars = Math.max(4, Math.floor((width - 8) / (fontSize * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const pieces = word.length > maxChars ? chunkText(word, maxChars) : [word];
    pieces.forEach((piece) => {
      const candidate = current ? `${current} ${piece}` : piece;
      if (candidate.length <= maxChars) {
        current = candidate;
        return;
      }
      if (current) lines.push(current);
      current = piece;
    });
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function chunkText(value, size) {
  const chunks = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

function drawText(commands, text, x, y, size, font = 'F1') {
  commands.push(`BT ${pdfColorCommand('default')}/${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
}

function drawCenteredText(commands, text, centerX, y, size, font = 'F1', tone = 'default') {
  const safeText = String(text ?? '');
  const approximateWidth = safeText.length * size * 0.52;
  commands.push(`BT ${pdfColorCommand(tone)}/${font} ${size} Tf ${(centerX - approximateWidth / 2).toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(safeText)}) Tj ET`);
}

function pdfColorCommand(tone) {
  const colors = {
    positive: '0.02 0.59 0.41 rg ',
    negative: '0.94 0.27 0.27 rg ',
    white: '1 1 1 rg ',
    muted: '0.32 0.38 0.48 rg ',
    default: '0 0 0 rg ',
  };
  return colors[tone] || colors.default;
}

function drawRect(commands, x, y, width, height, filled = false) {
  if (filled) {
    commands.push(`q 0.03 0.15 0.36 rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
  } else {
    commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  }
}

function drawCellBorder(commands, x, y, width, height) {
  commands.push(`q 0.78 0.83 0.90 RG 0.5 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
}

function truncateForWidth(value, width, fontSize) {
  const text = String(value ?? '');
  const maxChars = Math.max(4, Math.floor(width / (fontSize * 0.52)));
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 3))}...` : text;
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function slugify(value = '') {
  return String(value || 'projection').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projection';
}

function accountProjectionRowsForSelection(selectedProjection, accountId, hasScenario, projectionRows = []) {
  if (!selectedProjection || !accountId || accountId === 'all') return [];
  if (hasScenario) {
    return scenarioAccountProjectionRowsForSelection(selectedProjection, accountId, projectionRows);
  }
  const debts = projectionDebtsForScope(selectedProjection, hasScenario)
    .filter((debt) => String(debt.account_balance_id ?? '') === String(accountId));
  const projectionByMonth = new Map((projectionRows || []).map((row) => [row.month, row]));
  const valueSuffix = hasScenario ? '+' : '';
  const rows = accountProjectionSourceRows(selectedProjection, hasScenario);
  return rows
    .map((row) => {
      const account = (row.accounts || []).find((item) => String(item.account_balance_id) === String(accountId));
      if (!account) return null;
      const projectionRow = projectionByMonth.get(row.month) || {};
      const transferIn = Number(account.transfers_in || 0);
      const income = Number(account.income || 0) + transferIn;
      const debtPayments = Number(account.debt_payments || 0);
      const bills = Number(account.bills || 0);
      const transfersOut = Number(account.transfers_out || 0);
      const accountRow = {
        month: row.month,
        'Starting Account Balance': Number(account.starting_balance || 0),
        Income: income,
        'Total Debt Payments': debtPayments,
        Bills: bills,
        'Transfers In': transferIn,
        'Transfers Out': transfersOut,
        'Monthly Surplus': roundMoney(income - debtPayments - bills - transfersOut),
        'Cash Balance': Number(account.cash_balance || 0),
        'Ending Account Balance': Number(account.cash_balance || 0),
      };
      debts.forEach((debt) => {
        const label = debt._projection_label || debt.name || 'Debt';
        accountRow[label] = debt.debt_type === 'other'
          ? numberCell(projectionRow, suffixKey(`${label} Bill`, valueSuffix))
          : numberCell(projectionRow, suffixKey(`${label} Payment`, valueSuffix));
      });
      return accountRow;
    })
    .filter(Boolean);
}

function scenarioAccountProjectionRowsForSelection(selectedProjection, accountId, projectionRows = []) {
  const baselineRows = accountProjectionSourceRows(selectedProjection, false);
  const scenarioRows = accountProjectionSourceRows(selectedProjection, true);
  const baselineByMonth = new Map((baselineRows || []).map((row) => [row.month, row]));
  const scenarioByMonth = new Map((scenarioRows || []).map((row) => [row.month, row]));
  const projectionByMonth = new Map((projectionRows || []).map((row) => [row.month, row]));
  const debts = projectionDebtsForAccount(selectedProjection, accountId, true);
  const months = [...new Set([
    ...(baselineRows || []).map((row) => row.month),
    ...(scenarioRows || []).map((row) => row.month),
  ])].sort();

  return months
    .map((month) => {
      const baselineAccount = accountRowForMonth(baselineByMonth.get(month), accountId);
      const scenarioAccount = accountRowForMonth(scenarioByMonth.get(month), accountId);
      if (!baselineAccount && !scenarioAccount) return null;
      const projectionRow = projectionByMonth.get(month) || {};
      const baselineValues = accountValues(baselineAccount);
      const scenarioValues = accountValues(scenarioAccount || baselineAccount);
      const accountRow = {
        month,
        'Starting Account Balance': baselineValues.startingBalance,
        'Starting Account Balance+': scenarioValues.startingBalance,
        Income: baselineValues.income,
        'Income+': scenarioValues.income,
        'Total Debt Payments': baselineValues.debtPayments,
        'Total Debt Payments+': scenarioValues.debtPayments,
        Bills: baselineValues.bills,
        'Bills+': scenarioValues.bills,
        'Transfers In': baselineValues.transfersIn,
        'Transfers In+': scenarioValues.transfersIn,
        'Transfers Out': baselineValues.transfersOut,
        'Transfers Out+': scenarioValues.transfersOut,
        'Monthly Surplus': baselineValues.monthlySurplus,
        'Monthly Surplus+': scenarioValues.monthlySurplus,
        'Cash Balance': baselineValues.cashBalance,
        'Cash Balance+': scenarioValues.cashBalance,
        'Ending Account Balance': baselineValues.cashBalance,
        'Ending Account Balance+': scenarioValues.cashBalance,
      };
      debts.forEach((debt) => {
        const label = debt._projection_label || debt.name || 'Debt';
        const metricKey = debt.debt_type === 'other' ? `${label} Bill` : `${label} Payment`;
        accountRow[label] = numberCell(projectionRow, metricKey);
        accountRow[`${label}+`] = numberCell(projectionRow, `${metricKey}+`, metricKey);
      });
      return accountRow;
    })
    .filter(Boolean);
}

function accountRowForMonth(row = {}, accountId) {
  return (row.accounts || []).find((item) => String(item.account_balance_id) === String(accountId)) || null;
}

function accountValues(account = {}) {
  const transfersIn = Number(account?.transfers_in || 0);
  const income = Number(account?.income || 0) + transfersIn;
  const debtPayments = Number(account?.debt_payments || 0);
  const bills = Number(account?.bills || 0);
  const transfersOut = Number(account?.transfers_out || 0);
  return {
    startingBalance: Number(account?.starting_balance || 0),
    income,
    debtPayments,
    bills,
    transfersIn,
    transfersOut,
    monthlySurplus: roundMoney(income - debtPayments - bills - transfersOut),
    cashBalance: Number(account?.cash_balance || 0),
  };
}

function projectionDebtsForAccount(selectedProjection, accountId, includeScenario = false) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const baselineDebts = assumptions.baseline_assumptions?.debts || assumptions.debts || [];
  const scenarioDebts = includeScenario ? assumptions.debts || [] : [];
  const debts = [...baselineDebts, ...scenarioDebts]
    .filter((debt) => String(debt.account_balance_id ?? '') === String(accountId));
  return uniqueBy(debts, (debt) => `${debt._projection_label || debt.name || 'Debt'}:${debt.debt_type || ''}`);
}

function projectionDebtsForScope(selectedProjection, hasScenario) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  if (hasScenario) return assumptions.debts || [];
  return assumptions.baseline_assumptions?.debts || assumptions.debts || [];
}

function accountProjectionColumns(rows = []) {
  const knownColumns = [
    ...TABLE_COLUMN_VIEWS.accountProjection.defaultColumns,
    'Starting Account Balance',
    'Starting Account Balance+',
    'Income+',
    'Total Debt Payments+',
    'Bills+',
    'Transfers In',
    'Transfers In+',
    'Transfers Out+',
    'Monthly Surplus+',
    'Cash Balance+',
    'Ending Account Balance',
    'Ending Account Balance+',
  ];
  const dynamicDebtColumns = dynamicColumns(rows, knownColumns);
  return [
    'month',
    ...pairedMetricColumns(rows, 'Income'),
    ...pairedMetricColumns(rows, 'Total Debt Payments'),
    ...pairedMetricColumns(rows, 'Bills'),
    ...pairedActivityColumns(rows, 'Transfers In'),
    ...pairedActivityColumns(rows, 'Transfers Out'),
    ...dynamicDebtColumns.flatMap((column) => pairedMetricColumns(rows, column)),
    ...pairedMetricColumns(rows, 'Monthly Surplus'),
    ...pairedMetricColumns(rows, 'Cash Balance'),
  ];
}

function scenarioProjectionColumns(rows = []) {
  return [
    'month',
    ...pairedMetricColumns(rows, 'Income'),
    ...pairedMetricColumns(rows, 'Total Debt Payments'),
    ...pairedMetricColumns(rows, 'Bills'),
    ...pairedMetricColumns(rows, 'Interest'),
    ...pairedMetricColumns(rows, 'Principal'),
    ...pairedMetricColumns(rows, 'Total Debt Balance'),
    'Debts Paid Off',
    ...pairedMetricColumns(rows, 'Monthly Surplus'),
    ...pairedMetricColumns(rows, 'Cash Balance'),
  ];
}

function pairedMetricColumns(rows = [], column) {
  const plusColumn = `${column}+`;
  if (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))) return [];
  return plusColumnHasDeviation(rows, column, plusColumn) ? [column, plusColumn] : [column];
}

function pairedActivityColumns(rows = [], column) {
  const plusColumn = `${column}+`;
  const hasBaseActivity = rows.some((row) => Number(row?.[column] || 0) !== 0);
  const hasPlusActivity = rows.some((row) => Number(row?.[plusColumn] || 0) !== 0);
  if (!hasBaseActivity && !hasPlusActivity) return [];
  return plusColumnHasDeviation(rows, column, plusColumn) ? [column, plusColumn] : [column];
}

function ownerProjectionColumns(rows = [], hasScenario, selectedProjection, owner) {
  const debtTypeColumns = ownerDebtTypeColumns(selectedProjection, owner).filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );
  const baseColumns = [
    'month',
    'Income',
    'Total Debt Payments',
    'Bills',
  ];
  const transferInColumns = columnsWithActivity(rows, ['Transfers In']);
  const transferColumns = columnsWithActivity(rows, ['Transfers Out']);
  const ordered = [
    ...baseColumns,
    ...debtTypeColumns,
    ...transferInColumns,
    ...transferColumns,
    'Total Debt Balance',
    'Debts Paid Off',
    'Monthly Surplus',
    'Cash Balance',
  ];
  if (!hasScenario) return ordered;
  return [
    'month',
    'Income',
    'Income+',
    'Total Debt Payments',
    'Total Debt Payments+',
    'Bills',
    'Bills+',
    ...debtTypeColumns.flatMap((column) => [column, `${column}+`]),
    ...columnsWithActivity(rows, ['Transfers In', 'Transfers In+']),
    ...columnsWithActivity(rows, ['Transfers Out', 'Transfers Out+']),
    'Total Debt Balance',
    'Total Debt Balance+',
    'Debts Paid Off',
    'Debts Paid Off+',
    'Monthly Surplus',
    'Monthly Surplus+',
    'Cash Balance',
    'Cash Balance+',
  ];
}

function ownerDebtTypeColumns(selectedProjection, owner) {
  if (!owner || owner === 'overall') return [];
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const accountBalances = assumptions.account_balances || assumptions.baseline_assumptions?.account_balances || [];
  const ownerAccountIds = ownerAccountIdSet(accountBalances, owner);
  const debts = [
    ...(assumptions.baseline_assumptions?.debts || []),
    ...(assumptions.debts || []),
  ];
  return [...new Set(
    debts
      .filter((debt) => ownerAccountIds.has(String(debt.account_balance_id)))
      .map((debt) => debtTypePaymentColumn(debt.debt_type))
      .filter(Boolean)
  )];
}

function debtTypePaymentColumn(debtType) {
  const normalized = String(debtType || 'other');
  const labels = {
    credit_card: 'Credit Cards',
    vehicle_loan: 'Vehicle Loans',
    personal_loan: 'Personal Loans',
    student_loan: 'Student Loans',
    mortgage: 'Mortgages',
    other: 'Other',
  };
  return labels[normalized] || labelize(normalized);
}

function dynamicColumns(rows = [], knownColumns = []) {
  const known = new Set(knownColumns);
  return [...new Set(rows.flatMap((row) => Object.keys(row || {})))]
    .filter((column) => !known.has(column))
    .filter((column) => !column.endsWith(' Difference'))
    .filter((column) => !column.endsWith('+'));
}

function columnsWithActivity(rows = [], columns = []) {
  return columns.filter((column) => rows.some((row) => Number(row?.[column] || 0) !== 0));
}

function plusColumnHasDeviation(rows = [], column, plusColumn = `${column}+`) {
  return rows.some((row) => {
    if (!Object.prototype.hasOwnProperty.call(row || {}, plusColumn)) return false;
    const baseValue = comparableCellValue(row[column]);
    const plusValue = comparableCellValue(row[plusColumn]);
    return baseValue !== plusValue;
  });
}

function comparableCellValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'number') return roundMoney(value);
  if (value === undefined || value === null || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMoney(numeric) : String(value);
}

function scenarioDeviationAccountIds(selectedProjection) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const ids = new Set();
  const explicit = assumptions.scenario_overrides || {};
  (explicit.income_overrides || []).forEach((item) => addIncomeAccountIds(ids, item));
  (explicit.debt_overrides || []).forEach((item) => addAccountId(ids, item.account_balance_id));
  if (ids.size) return ids;

  const baseline = assumptions.baseline_assumptions || {};
  const baselineIncome = baseline.income_sources || [];
  const scenarioIncome = assumptions.income_sources || [];
  const baselineDebts = baseline.debts || [];
  const scenarioDebts = assumptions.debts || [];
  scenarioIncome
    .filter((item) => sourceDiffersFromBaseline(item, baselineIncome, 'label', comparableIncomeSource))
    .forEach((item) => addIncomeAccountIds(ids, item));
  scenarioDebts
    .filter((item) => sourceDiffersFromBaseline(item, baselineDebts, 'name', comparableDebtSource))
    .forEach((item) => addAccountId(ids, item.account_balance_id));
  return ids;
}

function addIncomeAccountIds(ids, item = {}) {
  if (isAccountTransfer(item)) {
    addAccountId(ids, item.from_account_id ?? item.fromAccountId);
    addAccountId(ids, item.to_account_id ?? item.toAccountId);
    return;
  }
  addAccountId(ids, item.account_balance_id ?? item.accountBalanceId);
}

function addAccountId(ids, value) {
  if (value === undefined || value === null || value === '') return;
  ids.add(String(value));
}

function sourceDiffersFromBaseline(item, baselineItems = [], naturalKey, comparable) {
  const baselineItem = baselineItems.find((candidate) => identityMatches(candidate, item, naturalKey));
  if (!baselineItem) return true;
  return comparable(baselineItem) !== comparable(item);
}

function identityMatches(left, right, naturalKey) {
  if (left?.id !== undefined && right?.id !== undefined && left.id !== null && right.id !== null) {
    return String(left.id) === String(right.id);
  }
  return left?.[naturalKey] && left[naturalKey] === right?.[naturalKey];
}

function comparableIncomeSource(item = {}) {
  return JSON.stringify({
    account_balance_id: item.account_balance_id || null,
    is_account_transfer: Boolean(item.is_account_transfer ?? item.isAccountTransfer),
    from_account_id: item.from_account_id || item.fromAccountId || null,
    to_account_id: item.to_account_id || item.toAccountId || null,
    label: item.label || '',
    amount: Number(item.amount || 0),
    start_date: item.start_date || item.startDate || '',
    end_date: item.end_date || item.endDate || null,
    frequency: item.frequency || 'monthly',
    active: item.active !== false,
  });
}

function comparableDebtSource(item = {}) {
  return JSON.stringify({
    account_balance_id: item.account_balance_id || item.accountBalanceId || null,
    name: item.name || '',
    debt_type: item.debt_type || item.debtType || '',
    current_balance: Number(item.current_balance ?? item.currentBalance ?? 0),
    minimum_monthly_payment: Number(item.minimum_monthly_payment ?? item.minimumMonthlyPayment ?? 0),
    planned_extra_payment: Number(item.planned_extra_payment ?? item.plannedExtraPayment ?? 0),
    recurrence: item.recurrence || null,
    payment_date: item.payment_date || item.paymentDate || null,
    start_date: item.start_date || item.startDate || '',
    payoff_target_date: item.payoff_target_date || item.payoffTargetDate || null,
    priority_number: item.priority_number || item.priorityNumber || null,
    active: item.active !== false,
  });
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function accountProjectionSourceRows(selectedProjection, hasScenario) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  if (hasScenario) {
    return assumptions._scenario_account_projection_rows || selectedProjection?.scenario_account_projection_rows || [];
  }
  return assumptions._account_projection_rows || selectedProjection?.account_projection_rows || [];
}

function accountSummaryFromRows(rows = []) {
  if (!rows.length) return null;
  const startingBalance = Number(rows[0]['Starting Account Balance'] || 0);
  const endingBalance = Number(rows[rows.length - 1]['Ending Account Balance'] || 0);
  const endingBalances = rows.map((row) => Number(row['Ending Account Balance'] || 0));
  return {
    startingBalance,
    endingBalance,
    lowestBalance: Math.min(...endingBalances),
    highestBalance: Math.max(...endingBalances),
    netChange: roundMoney(endingBalance - startingBalance),
  };
}

function ownerProjectionRows(rows = [], selectedProjection, owner, hasScenario) {
  if (!owner || owner === 'overall') return rows;
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const accountBalances = assumptions.account_balances || assumptions.baseline_assumptions?.account_balances || [];
  const ownerAccountIds = ownerAccountIdSet(accountBalances, owner);
  if (!ownerAccountIds.size) return rows.map((row) => emptyOwnerRow(row));

  const baselineAssumptions = assumptions.baseline_assumptions || assumptions;
  const baselineSources = ownerSourcesForAssumptions(baselineAssumptions, ownerAccountIds);
  const scenarioSources = hasScenario ? ownerSourcesForAssumptions(assumptions, ownerAccountIds) : null;
  let cashBalance = startingOwnerCash(accountBalances, ownerAccountIds, rows[0]?.month);
  let scenarioCashBalance = cashBalance;

  return rows.map((row) => {
    const month = row.month;
    const ownerRow = ownerRowForSources(row, month, baselineSources, '');
    cashBalance = roundMoney(cashBalance + ownerRow['Monthly Surplus']);
    ownerRow['Cash Balance'] = cashBalance;

    if (hasScenario && scenarioSources && rowHasScenarioValues(row)) {
      const scenarioValues = ownerRowForSources(row, month, scenarioSources, '+');
      scenarioCashBalance = roundMoney(scenarioCashBalance + scenarioValues['Monthly Surplus+']);
      scenarioValues['Cash Balance+'] = scenarioCashBalance;
      Object.assign(ownerRow, scenarioValues);
    }

    return ownerRow;
  });
}

function ownerRowForSources(row, month, sources, suffix) {
  const earnedIncome = sources.incomeSources.reduce((sum, source) => sum + ownerMonthlyIncomeAmount(source, month), 0);
  const transfers = sources.transfers.reduce(
    (totals, transfer) => {
      const movement = ownerTransferAmounts(transfer, month, sources.ownerAccountIds);
      return {
        in: totals.in + movement.in,
        out: totals.out + movement.out,
      };
    },
    { in: 0, out: 0 }
  );
  const income = earnedIncome + transfers.in;
  let totalDebtPayments = 0;
  let bills = 0;
  let interest = 0;
  let principal = 0;
  let totalDebt = 0;
  const paidOff = new Set(row[suffixKey('Debts Paid Off', suffix)] || []);
  const ownerPaidOff = [];
  const ownerRow = { month };

  sources.debts.forEach((debt) => {
    const label = debt._projection_label || debt.name || 'Debt';
    const balance = numberCell(row, suffixKey(label, suffix));
    const payment = numberCell(row, suffixKey(`${label} Payment`, suffix));
    const bill = numberCell(row, suffixKey(`${label} Bill`, suffix));
    const debtInterest = numberCell(row, suffixKey(`${label} Interest`, suffix));
    const debtPrincipal = numberCell(row, suffixKey(`${label} Principal`, suffix));

    ownerRow[suffixKey(label, suffix)] = balance;
    ownerRow[suffixKey(`${label} Payment`, suffix)] = payment;
    ownerRow[suffixKey(`${label} Interest`, suffix)] = debtInterest;
    ownerRow[suffixKey(`${label} Principal`, suffix)] = debtPrincipal;
    if (debt.debt_type === 'other') {
      ownerRow[suffixKey(`${label} Bill`, suffix)] = bill;
      ownerRow[suffixKey(debtTypePaymentColumn(debt.debt_type), suffix)] = roundMoney(
        (ownerRow[suffixKey(debtTypePaymentColumn(debt.debt_type), suffix)] || 0) + bill
      );
      bills += bill;
    } else {
      ownerRow[suffixKey(debtTypePaymentColumn(debt.debt_type), suffix)] = roundMoney(
        (ownerRow[suffixKey(debtTypePaymentColumn(debt.debt_type), suffix)] || 0) + payment
      );
      totalDebtPayments += payment;
      interest += debtInterest;
      principal += debtPrincipal;
      totalDebt += balance;
      if (paidOff.has(label)) ownerPaidOff.push(label);
    }
  });

  ownerRow[suffixKey('Income', suffix)] = roundMoney(income);
  ownerRow[suffixKey('Total Debt Payments', suffix)] = roundMoney(totalDebtPayments);
  ownerRow[suffixKey('Bills', suffix)] = roundMoney(bills);
  ownerRow[suffixKey('Total Interest Charged', suffix)] = roundMoney(interest);
  ownerRow[suffixKey('Total Debt', suffix)] = roundMoney(totalDebt);
  ownerRow[suffixKey('Debts Paid Off', suffix)] = ownerPaidOff;
  ownerRow[suffixKey('Transfers In', suffix)] = roundMoney(transfers.in);
  ownerRow[suffixKey('Transfers Out', suffix)] = roundMoney(transfers.out);
  ownerRow[suffixKey('Monthly Surplus', suffix)] = roundMoney(income - totalDebtPayments - bills - transfers.out);
  ownerRow[suffixKey('Principal', suffix)] = roundMoney(principal);
  return ownerRow;
}

function ownerAccountIdSet(accountBalances = [], owner) {
  return new Set(
    accountBalances
      .filter((account) => String(account.owner || '').trim() === owner)
      .map((account) => String(account.id))
      .filter(Boolean)
  );
}

function ownerSourcesForAssumptions(assumptions = {}, ownerAccountIds) {
  const incomeSources = assumptions.income_sources || [];
  return {
    ownerAccountIds,
    incomeSources: incomeSources.filter((source) => !isAccountTransfer(source) && ownerAccountIds.has(String(source.account_balance_id))),
    transfers: incomeSources.filter((source) => isAccountTransfer(source) && transferTouchesOwner(source, ownerAccountIds)),
    debts: (assumptions.debts || []).filter((debt) => ownerAccountIds.has(String(debt.account_balance_id))),
  };
}

function startingOwnerCash(accountBalances = [], ownerAccountIds, startMonth) {
  if (!startMonth) return 0;
  const start = firstOfMonthDate(startMonth);
  return roundMoney(
    accountBalances
      .filter((account) => account.active !== false)
      .filter((account) => ownerAccountIds.has(String(account.id)))
      .filter((account) => firstOfMonthDate(account.date) <= start)
      .reduce((sum, account) => sum + Number(account.amount || 0), 0)
  );
}

function ownerMonthlyIncomeAmount(source, month) {
  return Number(source.amount || 0) * occurrenceCountForMonth(
    source.frequency || 'monthly',
    source.start_date || source.startDate,
    source.end_date || source.endDate,
    month,
    source.active !== false
  );
}

function ownerTransferAmounts(transfer, month, ownerAccountIds) {
  const occurrences = occurrenceCountForMonth(
    transfer.frequency || 'monthly',
    transfer.start_date || transfer.startDate,
    transfer.end_date || transfer.endDate,
    month,
    transfer.active !== false
  );
  if (!occurrences) return { in: 0, out: 0 };
  const amount = Number(transfer.amount || 0) * occurrences;
  const fromOwner = ownerAccountIds.has(String(transfer.from_account_id ?? transfer.fromAccountId ?? ''));
  const toOwner = ownerAccountIds.has(String(transfer.to_account_id ?? transfer.toAccountId ?? ''));
  if (fromOwner && toOwner) return { in: 0, out: 0 };
  if (toOwner) return { in: amount, out: 0 };
  if (fromOwner) return { in: 0, out: amount };
  return { in: 0, out: 0 };
}

function isAccountTransfer(source = {}) {
  return Boolean(source.is_account_transfer ?? source.isAccountTransfer);
}

function transferTouchesOwner(source, ownerAccountIds) {
  return ownerAccountIds.has(String(source.from_account_id ?? source.fromAccountId ?? '')) ||
    ownerAccountIds.has(String(source.to_account_id ?? source.toAccountId ?? ''));
}

function occurrenceCountForMonth(frequency, startValue, endValue, monthValue, active = true) {
  if (!active || !startValue || !monthValue) return 0;
  const start = parseLocalDate(startValue);
  const end = endValue ? parseLocalDate(endValue) : null;
  const monthStart = firstOfMonthDate(monthValue);
  const monthEnd = lastOfMonthDate(monthStart);
  const rangeStart = maxDate(start, monthStart);
  const rangeEnd = minDate(end || monthEnd, monthEnd);
  if (rangeStart > rangeEnd) return 0;

  if (frequency === 'one_time') {
    return monthStart <= start && start <= monthEnd && (!end || start <= end) ? 1 : 0;
  }
  if (frequency === 'weekly' || frequency === 'bi_weekly') {
    const intervalDays = frequency === 'weekly' ? 7 : 14;
    const daysAfterAnchor = Math.max(daysBetween(start, rangeStart), 0);
    const occurrenceOffset = Math.ceil(daysAfterAnchor / intervalDays) * intervalDays;
    const firstOccurrence = addDays(start, occurrenceOffset);
    if (firstOccurrence > rangeEnd) return 0;
    return Math.floor(daysBetween(firstOccurrence, rangeEnd) / intervalDays) + 1;
  }
  if (frequency === 'first_and_fifteenth') {
    const first = monthStart;
    const fifteenth = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15);
    return [first, fifteenth].filter((candidate) => rangeStart <= candidate && candidate <= rangeEnd).length;
  }
  return 1;
}

function rowHasScenarioValues(row = {}) {
  return ['Income+', 'Total Debt Payments+', 'Bills+', 'Total Interest Charged+', 'Total Debt+', 'Monthly Surplus+', 'Cash Balance+']
    .some((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function emptyOwnerRow(row) {
  return {
    month: row.month,
    Income: 0,
    'Total Debt Payments': 0,
    Bills: 0,
    'Total Interest Charged': 0,
    'Total Debt': 0,
    'Debts Paid Off': [],
    'Monthly Surplus': 0,
    'Cash Balance': 0,
  };
}

function suffixKey(key, suffix) {
  return suffix ? `${key}${suffix}` : key;
}

function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day = '1'] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function firstOfMonthDate(value) {
  const date = parseLocalDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function lastOfMonthDate(value) {
  const date = firstOfMonthDate(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return date;
}

function daysBetween(start, end) {
  return Math.floor((parseLocalDate(end) - parseLocalDate(start)) / 86400000);
}

function maxDate(left, right) {
  return left > right ? left : right;
}

function minDate(left, right) {
  return left < right ? left : right;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function projectionSnapshot(selectedProjection, summary) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const sourceAssumptions = assumptions.baseline_assumptions || assumptions;
  const incomeSources = sourceAssumptions.income_sources || [];
  const debts = sortByDisplayOrder(sourceAssumptions.debts || []);
  const rates = sourceAssumptions.interest_rates || [];
  const accountBalances = sortByDisplayOrder(sourceAssumptions.account_balances || []);
  const fallbackIncome = incomeSources
    .filter((item) => item.active !== false)
    .reduce((sum, item) => sum + monthlyIncomeAmount(item), 0);
  const fallbackPayments = debts
    .filter((debt) => debt.active !== false && debt.debt_type !== 'other')
    .reduce((sum, debt) => sum + Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0), 0);
  const fallbackBills = debts
    .filter((debt) => debt.active !== false && debt.debt_type === 'other')
    .reduce((sum, debt) => sum + Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0), 0);
  const fallbackDebt = debts
    .filter((debt) => debt.active !== false && debt.debt_type !== 'other')
    .reduce((sum, debt) => sum + Number(debt.current_balance || 0), 0);
  return {
    accountBalanceRows: accountBalances.map((item) => [
      item.name || '-',
      item.account_type || '-',
      item.owner || '-',
      item.date ? shortMonth(item.date) : '-',
      currencyPrecise(item.amount),
    ]),
    debtRows: debts.map((debt) => {
      const rate = rates.find((item) => Number(item.debt_id) === Number(debt.id));
      const actualPayment = Number(debt.minimum_monthly_payment || 0) + Number(debt.planned_extra_payment || 0);
      return [
        debt.name || '-',
        labelize(debt.debt_type),
        currency(debt.current_balance),
        currency(debt.minimum_monthly_payment),
        currency(actualPayment),
        rate ? percent(rate.apr_percentage) : '0%',
      ];
    }),
    summary: {
      startMonth: selectedProjection?.generated_rows?.[0]?.month || null,
      income: summary.income_total ?? fallbackIncome,
      payments: summary.total_debt_payments ?? fallbackPayments,
      bills: summary.bills ?? fallbackBills,
      debt: summary.total_debt ?? fallbackDebt,
      remainingCash: summary.remaining_cash ?? (fallbackIncome - fallbackPayments - fallbackBills),
      payoff: bestPayoffDate(summary),
    },
  };
}

function bestPayoffDate(summary = {}) {
  return summary.payoff_estimate || null;
}

function monthlyIncomeAmount(source) {
  const amount = Number(source.amount || 0);
  return amount;
}

function insightCards(dashboard) {
  const summary = dashboard?.summary || {};
  const payoffDate = bestPayoffDate(summary);
  return [
    {
      label: 'Lowest Projected Cash',
      value: currency(summary.lowest_projected_remaining_cash),
      sublabel: formatMonth(summary.lowest_projected_remaining_cash_month),
      tone: summary.lowest_projected_remaining_cash < 0 ? 'danger' : 'positive',
    },
    { label: 'Debt Free Date', value: formatMonth(payoffDate), tone: 'scenario' },
    { label: 'Total Interest Paid', value: currency(summary.total_interest_projected), tone: 'danger' },
    {
      label: 'Months to Debt Free',
      value: summary.months_to_debt_free || 'Not projected',
      sublabel: summary.months_to_debt_free ? 'Months' : null,
    },
    { label: 'Average Monthly Surplus', value: currency(summary.average_monthly_surplus), tone: 'positive' },
  ];
}

function interestPoint(row, suffix) {
  const interest = numberCell(row, `Total Interest Charged${suffix}`, 'Total Interest Charged');
  const payments = numberCell(row, `Total Debt Payments${suffix}`, 'Total Debt Payments');
  return {
    month: `${shortMonth(row.month)}${suffix}`,
    interest,
    principal: Math.max(payments - interest, 0),
  };
}

function ownerMilestones(milestones = [], selectedProjection, owner, hasScenario) {
  if (!owner || owner === 'overall') return milestones;
  const normalizedMilestones = normalizeDashboardMilestones(milestones, selectedProjection, hasScenario);
  const qualifyingLabels = qualifyingDebtLabelsForOwner(selectedProjection, owner, hasScenario);
  if (!qualifyingLabels.size) return [];
  return normalizedMilestones
    .filter((item) => item.type === 'paid-off')
    .filter((item) => qualifyingLabels.has(item.label));
}

function qualifyingDebtLabelsForOwner(selectedProjection, owner, hasScenario) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const sourceAssumptions = hasScenario ? assumptions : assumptions.baseline_assumptions || assumptions;
  const accountBalances = assumptions.account_balances || assumptions.baseline_assumptions?.account_balances || [];
  const ownerAccountIds = ownerAccountIdSet(accountBalances, owner);
  return new Set(
    (sourceAssumptions.debts || [])
      .filter((debt) => ownerAccountIds.has(String(debt.account_balance_id)))
      .filter(isQualifyingPayoffDebt)
      .map((debt, index) => `${duplicateDebtDisplayLabelForDebt(debt, selectedProjection, hasScenario, index)} Paid Off`)
  );
}

function duplicateDebtDisplayLabelForDebt(debt, selectedProjection, hasScenario, index) {
  const context = duplicateDebtLabelContext(selectedProjection, hasScenario);
  if (!context.hasDuplicates) return debt._projection_label || debt.name || 'Debt';
  return context.identityLookup.get(debtDisplayIdentity(debt, index))
    || context.exactLookup.get(debtLookupKey(debt._projection_label || ''))
    || context.exactLookup.get(debtLookupKey(debt.name || ''))
    || debt._projection_label
    || debt.name
    || 'Debt';
}

function isQualifyingPayoffDebt(debt = {}) {
  if (!debt || debt.active === false || debt.debt_type === 'other') return false;
  return debtBalance(debt) > 0;
}

function debtBalance(debt = {}) {
  return Number(debt.current_balance ?? debt.starting_balance ?? debt.balance ?? 0);
}

function milestoneRows(rows, hasScenario) {
  const suffix = hasScenario ? '+' : '';
  const payoffKey = `Debts Paid Off${suffix}`;
  const debtKey = `Total Debt${suffix}`;
  const milestones = [];
  let debtFreeAdded = false;
  rows.forEach((row) => {
    const paidOff = Array.isArray(row[payoffKey]) ? row[payoffKey] : [];
    paidOff.forEach((name) => {
      milestones.push({
        month: row.month,
        label: `${name} Paid Off`,
        type: 'paid-off',
      });
    });
    if (!debtFreeAdded && Number(row[debtKey] ?? row['Total Debt'] ?? 0) <= 0) {
      debtFreeAdded = true;
      milestones.push({
        month: row.month,
        label: 'Debt Free',
        type: 'debt-free',
      });
    }
  });
  return milestones;
}

export const dashboardInstructions = {
  title: 'Instructions',
  sections: [
    {
      heading: 'Saved Projection',
      body: 'Choose any saved baseline or scenario projection to populate the analytics hub.',
    },
    {
      heading: 'Projection Overview',
      body: 'Review month-by-month projection rows below the chart grid.',
    },
  ],
  tips: [
    'Dashboard payoff dates can extend beyond the visible projection table.',
    'Scenario projections include comparison chart lines when available.',
    'Column controls are kept on tables for future saved view customization.',
  ],
};
