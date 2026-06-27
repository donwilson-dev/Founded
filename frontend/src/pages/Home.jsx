import React, { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { foundedApi } from '../api/foundedApi.js';
import foundedLogo from '../assets/illustrations/founded-logo.png';
import baselineIcon from '../assets/icons/features/baseline-builder.png';
import scenarioIcon from '../assets/icons/features/scenario-builder.png';
import dashboardIcon from '../assets/icons/features/dashboard.png';
import guideIcon from '../assets/icons/features/guide.png';
import workflowNumber1 from '../assets/icons/workflow/numbers/1.png';
import workflowNumber2 from '../assets/icons/workflow/numbers/2.png';
import workflowNumber3 from '../assets/icons/workflow/numbers/3.png';
import workflowNumber4 from '../assets/icons/workflow/numbers/4.png';
import workflowNumber5 from '../assets/icons/workflow/numbers/5.png';
import workflowNumber6 from '../assets/icons/workflow/numbers/6.png';
import workflowNumber7 from '../assets/icons/workflow/numbers/7.png';
import workflowBuildBaseline from '../assets/icons/workflow/01-build-baseline.png';
import workflowSaveBaseline from '../assets/icons/workflow/02-save-baseline.png';
import workflowLoadScenario from '../assets/icons/workflow/03-load-scenario.png';
import workflowAddDeviations from '../assets/icons/workflow/04-add-deviations.png';
import workflowGenerate from '../assets/icons/workflow/05-generate.png';
import workflowReview from '../assets/icons/workflow/06-review.png';
import workflowDashboard from '../assets/icons/workflow/07-dashboard.png';
import heroBuildBaseline from '../assets/icons/hero/build-baseline.png';
import heroCompareScenarios from '../assets/icons/hero/compare-scenarios.png';
import heroAnalyzeResults from '../assets/icons/hero/analyze-results.png';

const navigationCards = [
  {
    title: 'Baseline Builder',
    body: 'Create and save financial projections from income, debts, bills, balances, and APR schedules.',
    action: 'Open Baseline Builder',
    target: 'baseline',
    icon: baselineIcon,
    tone: 'blue',
  },
  {
    title: 'Scenario Builder',
    body: 'Compare payoff and cash-flow changes without altering the original baseline.',
    action: 'Open Scenario Builder',
    target: 'scenario',
    icon: scenarioIcon,
    tone: 'purple',
  },
  {
    title: 'Dashboard',
    body: 'Analyze trends, milestones, monthly cash flow, and payoff progress from saved projections.',
    action: 'Open Dashboard',
    target: 'dashboard',
    icon: dashboardIcon,
    tone: 'green',
  },
  {
    title: 'How It Works',
    body: 'Review the workflow, explore key features, and get tips to make the most of Founded.',
    action: 'View Guide',
    target: 'home',
    icon: guideIcon,
    tone: 'orange',
  },
];

const workflowSteps = [
  {
    title: 'Build or Load a Baseline',
    body: 'Start with income, debts, bills, balances, and starting cash.',
    target: 'baseline',
    number: workflowNumber1,
    icon: workflowBuildBaseline,
  },
  {
    title: 'Save Your Baseline',
    body: 'Save your baseline so it can serve as the foundation.',
    target: 'baseline',
    number: workflowNumber2,
    icon: workflowSaveBaseline,
  },
  {
    title: 'Create or Load a Scenario',
    body: 'Name a scenario or load a saved one to continue.',
    target: 'scenario',
    number: workflowNumber3,
    icon: workflowLoadScenario,
  },
  {
    title: 'Add Deviations',
    body: 'Adjust income, debt payments, new debts, or APR changes.',
    target: 'scenario',
    number: workflowNumber4,
    icon: workflowAddDeviations,
  },
  {
    title: 'Generate Scenario',
    body: 'Calculate the impact and view scenario results.',
    target: 'scenario',
    number: workflowNumber5,
    icon: workflowGenerate,
  },
  {
    title: 'Review Comparisons',
    body: 'Compare scenario results to your baseline.',
    target: 'scenario',
    number: workflowNumber6,
    icon: workflowReview,
  },
  {
    title: 'Analyze on Dashboard',
    body: 'Dive deeper into trends, milestones, and cash flow.',
    target: 'dashboard',
    number: workflowNumber7,
    icon: workflowDashboard,
  },
];

const heroCallouts = [
  {
    title: 'Build a Baseline',
    body: 'Create and maintain your financial foundation.',
    icon: heroBuildBaseline,
  },
  {
    title: 'Compare Scenarios',
    body: 'Model "what-if" changes and see the impact.',
    icon: heroCompareScenarios,
  },
  {
    title: 'Analyze Results',
    body: 'Review trends, cash flow, and payoff progress.',
    icon: heroAnalyzeResults,
  },
];

function formatActivityMonth(value) {
  if (!value) return 'No saved activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No saved activity';
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

export default function Home({ onNavigate }) {
  const [savedProjections, setSavedProjections] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadProjectionCount() {
      try {
        const items = await foundedApi.listSavedProjections();
        if (!ignore) setSavedProjections(Array.isArray(items) ? items : []);
      } catch {
        if (!ignore) setSavedProjections([]);
      }
    }

    loadProjectionCount();
    window.addEventListener('founded:saved-projections-changed', loadProjectionCount);

    return () => {
      ignore = true;
      window.removeEventListener('founded:saved-projections-changed', loadProjectionCount);
    };
  }, []);

  const projectionCountLabel = useMemo(() => {
    const count = savedProjections.length;
    return `${count} ${count === 1 ? 'projection' : 'projections'}`;
  }, [savedProjections.length]);

  const workspaceSummaryCards = useMemo(() => {
    const baselines = savedProjections.filter((item) => item.projection_type === 'baseline');
    const scenarios = savedProjections.filter((item) => item.projection_type === 'scenario');
    const latestBaseline = baselines.reduce((current, item) => {
      if (!item?.updated_at) return current;
      if (!current?.updated_at) return item;
      return new Date(item.updated_at).getTime() > new Date(current.updated_at).getTime() ? item : current;
    }, null);
    const latestScenario = scenarios.reduce((current, item) => {
      if (!item?.updated_at) return current;
      if (!current?.updated_at) return item;
      return new Date(item.updated_at).getTime() > new Date(current.updated_at).getTime() ? item : current;
    }, null);

    return [
      {
        label: 'Baselines',
        value: String(baselines.length),
      },
      {
        label: 'Scenarios',
        value: String(scenarios.length),
      },
      {
        label: 'Last Baseline Update',
        value: formatActivityMonth(latestBaseline?.updated_at),
      },
      {
        label: 'Last Scenario Update',
        value: formatActivityMonth(latestScenario?.updated_at),
      },
      {
        label: 'Saved Projections',
        value: projectionCountLabel,
      },
    ];
  }, [projectionCountLabel, savedProjections]);

  return (
    <div className="home-workspace">
      <section className="home-workspace-hero">
        <div className="home-workspace-copy">
          <p className="home-welcome">Welcome back.</p>
          <h2>Financial Planning Workspace</h2>
          <p className="home-hero-copy">
            Build, compare, and analyze long-term financial projections with clarity and confidence.
          </p>

          <div className="home-hero-callouts" aria-label="Founded planning focus areas">
            {heroCallouts.map((callout) => (
              <article className="home-hero-callout" key={callout.title}>
                <span className="home-hero-callout-icon" aria-hidden="true">
                  <img src={callout.icon} alt="" />
                </span>
                <span className="home-hero-callout-copy">
                  <strong>{callout.title}</strong>
                  <span>{callout.body}</span>
                </span>
              </article>
            ))}
          </div>
        </div>

        <div className="home-hero-illustration" aria-hidden="true">
          <img src={foundedLogo} alt="" />
        </div>
      </section>

      <section className="home-workflow-section" aria-labelledby="home-workflow-title">
        <div className="home-section-heading">
          <h3 id="home-workflow-title">Your Financial Planning Workflow</h3>
        </div>
        <div className="home-workflow-grid">
          {workflowSteps.map((step) => (
            <button
              className="home-workflow-card"
              key={step.title}
              onClick={() => onNavigate(step.target)}
              type="button"
            >
              <span className="home-workflow-number" aria-hidden="true">
                <img src={step.number} alt="" />
              </span>
              <span className="home-workflow-icon" aria-hidden="true">
                <img src={step.icon} alt="" />
              </span>
              <span className="home-workflow-title">{step.title}</span>
              <span className="home-workflow-body">{step.body}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-nav-section" aria-labelledby="home-nav-title">
        <div className="home-nav-grid" aria-label="Founded workspace navigation">
          {navigationCards.map((card) => (
            <button
              className={`home-nav-card ${card.tone}`}
              key={card.title}
              onClick={() => onNavigate(card.target)}
              type="button"
            >
              <span className="home-nav-card-icon" aria-hidden="true">
                <img src={card.icon} alt="" />
              </span>
              <span className="home-nav-card-content">
                <span className="home-nav-card-title">{card.title}</span>
                <span className="home-nav-card-body">{card.body}</span>
              </span>
              <span className="home-nav-card-action">
                {card.action}
                <span aria-hidden="true">&rarr;</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-workspace-summary" aria-labelledby="home-workspace-summary-title">
        <div className="home-summary-heading">
          <span className="home-summary-icon" aria-hidden="true">
            <Clock3 size={20} strokeWidth={2.4} />
          </span>
          <h3 id="home-workspace-summary-title">Your Workspace at a Glance:</h3>
        </div>
        <div className="home-summary-grid">
          {workspaceSummaryCards.map((card) => (
            <article className="home-summary-card" key={card.label}>
              <strong>{card.value}</strong>
              <span className="home-summary-card-label">{card.label}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export const homeInstructions = {
  title: 'Instructions',
  sections: [
    {
      heading: 'What Founded Does',
      body: 'Founded turns income, debts, bills, APR schedules, and payments into monthly payoff and cash-flow projections.',
    },
    {
      heading: 'Saved Projections',
      body: 'Saved projections keep calculated rows and the assumptions used to generate them.',
    },
    {
      heading: 'Scenario "+" Columns',
      body: 'Scenario columns show changed values beside the original baseline values for comparison.',
    },
  ],
  tips: [
    'Start with a baseline before creating scenarios.',
    'Use short, descriptive projection titles.',
    'Treat all projections as estimates.',
  ],
};
