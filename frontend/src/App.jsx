import React from 'react';
import { useMemo } from 'react';
import Layout from './components/Layout.jsx';
import BaselineBuilder, { baselineInstructions } from './pages/BaselineBuilder.jsx';
import Dashboard, { dashboardInstructions } from './pages/Dashboard.jsx';
import Home, { homeInstructions } from './pages/Home.jsx';
import ScenarioBuilder, { scenarioInstructions } from './pages/ScenarioBuilder.jsx';
import { useSessionState } from './utils/persistence.js';

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
  const page = useMemo(() => pages[safeActivePage], [safeActivePage]);

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
        return (
          <section className={safeActivePage === id ? 'workspace-page active' : 'workspace-page'} key={id}>
            <PageComponent onNavigate={setActivePage} isActive={safeActivePage === id} />
          </section>
        );
      })}
    </Layout>
  );
}
