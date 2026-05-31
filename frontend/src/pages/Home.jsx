import React from 'react';
import {
  ArrowRight,
  Database,
  GitCompare,
  LayoutDashboard,
  WalletCards,
} from "lucide-react";

const homeCards = [
  {
    title: "Baseline Builder",
    icon: WalletCards,
    body: "Create and save financial projections from income, debts, bills, balances, and APR schedules.",
  },
  {
    title: "Scenario Builder",
    icon: GitCompare,
    body: "Compare payoff and cash-flow changes without altering the original baseline.",
  },
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    body: "Analyze trends, milestones, monthly cash flow, and payoff progress from saved projections.",
  },
  {
    title: "Saved Projections",
    icon: Database,
    body: "Store and reopen baseline plans and scenarios with their source assumptions intact.",
  },
];

export default function Home({ onNavigate }) {
  return (
    <div className="home-grid">
      <section className="home-hero">
        <div>
          <p className="eyebrow">Financial planning workspace</p>
          <h2>
            Forecast debt payoff and cash flow with confidence.
          </h2>
          <p>
            Track debts, income, bills, and future cash flow through saved
            projections and scenario planning.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => onNavigate("baseline")}
        >
          Start Baseline <ArrowRight size={18} />
        </button>
      </section>

      <section className="card workflow-card">
        <h2>Recommended Workflow</h2>
        <ol className="workflow-list">
          <li>Build a baseline from income, debts, bills, and starting cash.</li>
          <li>Generate the monthly projection and save it with a clear title.</li>
          <li>
            Compare changes in Scenario Builder without overwriting the baseline.
          </li>
          <li>Review saved baselines and scenarios on the Dashboard.</li>
        </ol>
      </section>

      <section className="home-card-grid">
        {homeCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="card home-card" key={card.title}>
              <Icon size={24} />
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          );
        })}
      </section>

      <section className="estimate-note">
        Projections are estimates. Update balances, payments, bills, and APRs
        as real numbers change.
      </section>
    </div>
  );
}

export const homeInstructions = {
  title: "Instructions",
  sections: [
    {
      heading: "What Founded Does",
      body: "Founded turns income, debts, bills, APR schedules, and payments into monthly payoff and cash-flow projections.",
    },
    {
      heading: "Saved Projections",
      body: "Saved projections keep calculated rows and the assumptions used to generate them.",
    },
    {
      heading: 'Scenario "+" Columns',
      body: "Scenario columns show changed values beside the original baseline values for comparison.",
    },
  ],
  tips: [
    "Start with a baseline before creating scenarios.",
    "Use short, descriptive projection titles.",
    "Treat all projections as estimates.",
  ],
};
