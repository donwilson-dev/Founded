import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout.jsx';
import { useSessionState } from './utils/persistence.js';

const Home = lazy(() => import('./pages/Home.jsx'));
const BaselineBuilder = lazy(() => import('./pages/BaselineBuilder.jsx'));
const ScenarioBuilder = lazy(() => import('./pages/ScenarioBuilder.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));

const homeInstructions = {
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

const baselineInstructions = {
  title: 'Instructions',
  sections: [
    { heading: '1. Add Income', body: 'Add all monthly income sources with start dates and optional end dates.' },
    { heading: '2. Edit Or Delete', body: 'Use the row action icons to keep existing income and debt records current.' },
    { heading: '3. Generate', body: 'Generate a baseline table using current backend income and debt records.' },
    { heading: '4. Save', body: 'Save useful baselines so Scenario Builder and Dashboard can reopen them later.' },
  ],
  tips: ['No APR is treated as 0%.', 'Seeded records can be edited or removed.', 'Projection results are estimates.'],
};

const scenarioInstructions = {
  title: 'Instructions',
  sections: [
    { heading: '1. Open Baseline', body: 'Choose a saved baseline projection. The original rows remain unchanged.' },
    { heading: '2. Add Deviations', body: 'Add changed income, changed debt payments, new debts, or APR changes.' },
    { heading: '3. Generate', body: 'Scenario values appear beside baseline values with + column names.' },
    { heading: '4. Save', body: 'Save the scenario as a separate projection for dashboard comparison.' },
  ],
  tips: ['Purple-tinted columns are scenario values.', 'Use deviation start dates for mid-plan changes.', 'Scenarios do not overwrite baselines.'],
};

const dashboardInstructions = {
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
    <Layout
      activePage={safeActivePage}
      onNavigate={setActivePage}
      title={page.title}
      subtitle={page.subtitle}
      instructions={page.instructions}
    >
      {Object.entries(pages).map(([id, config]) => {
        const PageComponent = config.Component;
        const shouldRender = renderedPageIds.has(id);
        return (
          <section className={safeActivePage === id ? 'workspace-page active' : 'workspace-page'} key={id}>
            {shouldRender ? (
              <Suspense fallback={safeActivePage === id ? <div className="empty-state">Loading...</div> : null}>
                <PageComponent onNavigate={setActivePage} isActive={safeActivePage === id} />
              </Suspense>
            ) : null}
          </section>
        );
      })}
    </Layout>
  );
}
