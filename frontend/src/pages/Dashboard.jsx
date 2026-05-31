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
import { currency, currencyPrecise, labelize, percent, shortMonth } from '../utils/formatters.js';
import { useSessionState } from '../utils/persistence.js';
import { TABLE_COLUMN_VIEWS, normalizeProjectionRows } from '../utils/tableHelpers.js';

const colors = ['#2563eb', '#7c3aed', '#10b981', '#ef4444', '#14b8a6', '#f59e0b'];

export default function Dashboard({ onNavigate, isActive = false }) {
  const [saved, setSaved] = useState([]);
  const [projectionId, setProjectionId] = useSessionState('founded.dashboard.projectionId', '');
  const [dashboard, setDashboard] = useSessionState('founded.dashboard.summary', null);
  const [selectedProjection, setSelectedProjection] = useSessionState('founded.dashboard.selectedProjection', null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
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

  function viewAllInputs() {
    if (projectionId) {
      window.sessionStorage.setItem('founded.baseline.openProjectionId', String(projectionId));
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

  const projectionRows = dashboard?.projection_rows || [];
  const normalizedProjectionRows = useMemo(() => normalizeProjectionRows(projectionRows), [projectionRows]);
  const summary = dashboard?.summary || {};
  const snapshot = useMemo(() => projectionSnapshot(selectedProjection, summary), [selectedProjection, summary]);
  const hasScenario = Boolean(dashboard?.supports_scenario);
  const chartRows = useMemo(() => {
    const debt = dashboard?.datasets?.total_debt_over_time || [];
    const scenarioDebt = dashboard?.datasets?.scenario_total_debt_over_time || [];
    return debt.map((item, index) => ({
      month: shortMonth(item.month),
      baselineDebt: item.value,
      scenarioDebt: scenarioDebt[index]?.value,
    }));
  }, [dashboard]);
  const cashRows = useMemo(() => cashFlowRows(projectionRows, hasScenario), [projectionRows, hasScenario]);
  const pieRows = debtBreakdownRows(dashboard?.datasets?.debt_breakdown_by_account || []);
  const scenarioPieRows = debtBreakdownRows(scenarioDebtBreakdown(selectedProjection, projectionRows));
  const insights = insightCards(dashboard);
  const milestones = useMemo(
    () => dashboard?.datasets?.milestones || milestoneRows(projectionRows, hasScenario),
    [dashboard, projectionRows, hasScenario]
  );
  const projectionTableColumns = hasScenario ? TABLE_COLUMN_VIEWS.scenarioComparison.defaultColumns : TABLE_COLUMN_VIEWS.projectionOverview.defaultColumns;
  const sampledChartRows = useMemo(() => sampleChartRows(chartRows, 6), [chartRows]);
  const sampledCashRows = cashRows;
  const sampledInterestRows = useMemo(() => interestRows(projectionRows, hasScenario), [projectionRows, hasScenario]);
  const hasDashboard = Boolean(dashboard);
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
          title="Income Sources"
          columns={['Name', 'Start Date', 'Amount', 'Frequency']}
          rows={snapshot.incomeRows}
          emptyText="Select a projection to preview income sources."
          actionLabel="View All Income"
          onAction={viewAllInputs}
        />
        <SnapshotTable
          title="Debts"
          columns={['Debt Name', 'Type', 'Balance', 'Min. Pay.', 'APR']}
          rows={snapshot.debtRows}
          emptyText="Select a projection to preview debts."
          actionLabel="View All Debts"
          onAction={viewAllInputs}
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
          isEmpty={!hasDashboard || !sampledChartRows.length}
          emptyBody="Select a saved projection to plot debt balance over time."
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={sampledChartRows} margin={{ top: 8, right: 14, bottom: 12, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
              <XAxis dataKey="month" interval={0} height={40} tickMargin={12} />
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
          isEmpty={!hasDashboard || !sampledCashRows.length}
          emptyBody="Open a saved projection to compare monthly cash movement."
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
          emptyBody="Debt share appears after a saved projection is selected."
        >
          <div className={`debt-breakdown-layout ${scenarioPieRows.length ? 'has-scenario' : ''}`}>
            <DebtDonut title="Baseline" rows={pieRows} total={summary.total_debt} tooltipProps={tooltipProps} />
            {scenarioPieRows.length ? (
              <DebtDonut title="Scenario+" rows={scenarioPieRows} total={scenarioPieRows.reduce((sum, row) => sum + row.value, 0)} tooltipProps={tooltipProps} />
            ) : null}
          </div>
        </ChartCard>

        <ChartCard
          title="Interest vs Principal Paid"
          info="Compares projected interest versus principal payments over time."
          isEmpty={!hasDashboard || !sampledInterestRows.length}
          emptyBody="Interest and principal bars appear when projection rows are available."
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

      {normalizedProjectionRows.length ? (
        <ProjectionTable
          rows={normalizedProjectionRows}
          preferredColumns={projectionTableColumns}
          initialVisibleCount={9}
          storageKey={hasScenario ? 'founded.dashboard.scenarioProjectionOverview.v4' : 'founded.dashboard.projectionOverview.v4'}
        />
      ) : (
        <section className="card table-card">
          <EmptyState title="Projection overview waits here" body="Select a saved projection to review its month-by-month table." />
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
              {rows.slice(0, 6).map((row, index) => (
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

function debtBreakdownRows(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return rows
    .filter((row) => Number(row.value || 0) > 0)
    .map((row, index) => ({
      ...row,
      color: colors[index % colors.length],
      chartName: `${row.name || 'Debt'} ${index + 1}`,
      percent: total ? (Number(row.value || 0) / total) * 100 : 0,
    }));
}

function scenarioDebtBreakdown(selectedProjection, rows) {
  if (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'Total Debt+'))) return [];
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const debts = assumptions.debts || assumptions.baseline_assumptions?.debts || [];
  const firstScenarioRow = rows.find((row) => row['Total Debt+'] !== undefined) || rows[0] || {};
  return debts
    .map((debt) => ({
      name: debt._projection_label || debt.name,
      value: Number(firstScenarioRow[`${debt._projection_label || debt.name}+`] ?? firstScenarioRow[debt._projection_label || debt.name] ?? 0),
    }))
    .filter((row) => row.value > 0);
}

function projectionSnapshot(selectedProjection, summary) {
  const assumptions = selectedProjection?.assumptions_snapshot || {};
  const incomeSources = assumptions.income_sources || assumptions.baseline_assumptions?.income_sources || [];
  const debts = assumptions.debts || assumptions.baseline_assumptions?.debts || [];
  const rates = assumptions.interest_rates || assumptions.baseline_assumptions?.interest_rates || [];
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
    incomeRows: incomeSources.slice(0, 6).map((item) => [
      item.label || item.name || '-',
      shortMonth(item.start_date),
      currencyPrecise(item.amount),
      labelize(item.frequency || 'monthly'),
    ]),
    debtRows: debts.slice(0, 6).map((debt) => {
      const rate = rates.find((item) => Number(item.debt_id) === Number(debt.id));
      return [
        debt.name || '-',
        labelize(debt.debt_type),
        currency(debt.current_balance),
        currency(debt.minimum_monthly_payment),
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
