import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout.jsx';
import LaunchScreen from './components/LaunchScreen/LaunchScreen.jsx';
import { useSessionState } from './utils/persistence.js';

const Home = lazy(() => import('./pages/Home.jsx'));
const BaselineBuilder = lazy(() => import('./pages/BaselineBuilder.jsx'));
const ScenarioBuilder = lazy(() => import('./pages/ScenarioBuilder.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));

const homeInstructions = {
  title: 'Page Guide',
  sections: [
    {
      heading: 'Purpose',
      body: 'Founded helps you build a clear financial plan from your income, bills, debts, balances, payments, and interest rates.',
    },
    {
      heading: 'Workflow',
      body: 'Start in Baseline Builder to create your financial foundation, use Scenario Builder to test changes, then review saved plans in Dashboard.',
    },
    {
      heading: 'Need More Help',
      body: 'Every page in Founded includes a contextual Page Guide. Open it whenever you want help understanding the page you are using.',
    },
  ],
  tips: [
    'Build and save a baseline before creating scenarios.',
    'Use short, descriptive names for saved plans.',
    'Review the Dashboard after saving projections to compare progress.',
  ],
};

const baselineInstructions = {
  title: 'Page Guide',
  sections: [
    { heading: 'Purpose', body: 'Baseline Builder creates the financial foundation for your plan. It captures the current picture before you test changes.' },
    { heading: 'Workflow', body: 'Add financial data, review accounts, debts, bills, and income, generate the projection, then save the baseline for scenarios and dashboard review.' },
    { heading: 'Need More Help', body: 'Return to Home to review the complete Founded workflow, or keep this Page Guide open while you build your baseline.' },
  ],
  tips: [
    'Include all regular income, bills, and debt payments before generating.',
    'Update balances and APRs when real numbers change.',
    'Save your baseline once it represents the plan you want to compare against.',
  ],
};

const scenarioInstructions = {
  title: 'Page Guide',
  sections: [
    { heading: 'Purpose', body: 'Scenario Builder lets you test what could change without overwriting your original baseline.' },
    { heading: 'Workflow', body: 'Open a saved baseline, add scenario changes, generate the scenario, then save it as a separate plan for comparison.' },
    { heading: 'Need More Help', body: 'Use the Dashboard after saving a scenario to compare outcomes, milestones, cash flow, and payoff timing.' },
  ],
  tips: [
    'Create one scenario per major question so comparisons stay clear.',
    'Use start dates when a change begins later in the plan.',
    'Scenarios never overwrite the baseline they are based on.',
  ],
};

const dashboardInstructions = {
  title: 'Page Guide',
  sections: [
    {
      heading: 'Purpose',
      body: 'Dashboard turns saved baselines and scenarios into charts, milestones, tables, and exportable summaries.',
    },
    {
      heading: 'Workflow',
      body: 'Select a saved projection, review the charts and milestones, inspect the projection table, compare scenario results when available, and export views when you need a record.',
    },
    {
      heading: 'Need More Help',
      body: 'Visit Home for the full planning workflow, or continue through saved projections to build confidence with your financial plan.',
    },
  ],
  tips: [
    'Start with the overview cards before reading individual charts.',
    'Use milestones to understand when important payoff events occur.',
    'Export reports after selecting the projection and view you want to share.',
  ],
};

const pages = {
  home: {
    title: 'Home',
    subtitle: 'Plan debt payoff projections and compare financial scenarios.',
    instructions: homeInstructions,
    Component: Home,
  },
  baseline: {
    title: 'Baseline Builder',
    subtitle: 'Create your financial foundation and generate a projection.',
    instructions: baselineInstructions,
    Component: BaselineBuilder,
  },
  scenario: {
    title: 'Scenario Builder',
    subtitle: 'Model deviations from a saved baseline without changing the original.',
    instructions: scenarioInstructions,
    Component: ScenarioBuilder,
  },
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Analyze saved projections, payoff timing, cash flow, and debt movement.',
    instructions: dashboardInstructions,
    Component: Dashboard,
  },
};

export default function App() {
  const [activePage, setActivePage] = useSessionState('founded.activePage', 'home');
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const [guideOpenSignal, setGuideOpenSignal] = useState(0);
  const safeActivePage = pages[activePage] ? activePage : 'home';
  const [loadedPageIds, setLoadedPageIds] = useState([safeActivePage]);
  const page = useMemo(() => pages[safeActivePage], [safeActivePage]);
  const renderedPageIds = useMemo(() => new Set([...loadedPageIds, safeActivePage]), [loadedPageIds, safeActivePage]);

  useEffect(() => {
    setLoadedPageIds((current) => (
      current.includes(safeActivePage) ? current : [...current, safeActivePage]
    ));
  }, [safeActivePage]);

  return (
    <>
      <Layout
        activePage={safeActivePage}
        onNavigate={setActivePage}
        title={page.title}
        subtitle={page.subtitle}
        instructions={page.instructions}
        guideOpenSignal={guideOpenSignal}
      >
        {Object.entries(pages).map(([id, config]) => {
          const PageComponent = config.Component;
          const shouldRender = renderedPageIds.has(id);
          return (
            <section className={safeActivePage === id ? 'workspace-page active' : 'workspace-page'} key={id}>
              {shouldRender ? (
                <Suspense fallback={safeActivePage === id ? <div className="empty-state">Loading...</div> : null}>
                  <PageComponent
                    onNavigate={setActivePage}
                    onOpenGuide={() => setGuideOpenSignal((value) => value + 1)}
                    isActive={safeActivePage === id}
                  />
                </Suspense>
              ) : null}
            </section>
          );
        })}
      </Layout>
      {showLaunchScreen ? <LaunchScreen onComplete={() => setShowLaunchScreen(false)} /> : null}
    </>
  );
}
