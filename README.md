# Founded Backend

Backend foundation for Founded, a financial planning app for income, debt, projections, scenarios, debt payoff forecasting, and dashboard-ready data.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
uvicorn app.main:app --reload
```

API docs are available at `http://127.0.0.1:8000/docs`.

## Frontend

```powershell
cd frontend
npm install
npm run dev -- --port 5173
```

The React app runs at `http://127.0.0.1:5173` and talks to the FastAPI backend at `http://127.0.0.1:8000`.

## Test

```powershell
pytest
```

## Seed Data

```powershell
python -m app.seed
```

Running the seed command replaces local financial records with the official portfolio-safe demonstration dataset:

- Demo Household Baseline
- Demo Debt Reduction Scenario
- Demo Income Increase Scenario
- Demo Emergency Expense Scenario

The demo data is synthetic and is intended for screenshots, walkthroughs, desktop testing, and migration validation. The first projection month is January 2026.

| Saved Projection | Monthly Surplus | Cash Balance | Total Debt Balance | Total Debt Payments | Bills | Principal | Interest |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Demo Household Baseline | $8,670.00 | $39,070.00 | $45,648.21 | $1,295.00 | $635.00 | $1,051.79 | $243.21 |
| Demo Debt Reduction Scenario | $8,405.00 | $38,805.00 | $45,348.21 | $1,595.00 | $600.00 | $1,351.79 | $243.21 |
| Demo Income Increase Scenario | $9,370.00 | $39,770.00 | $45,648.21 | $1,295.00 | $635.00 | $1,051.79 | $243.21 |
| Demo Emergency Expense Scenario | $8,670.00 | $39,070.00 | $45,648.21 | $1,295.00 | $635.00 | $1,051.79 | $243.21 |

## Account Integrity Framework

Overall projections remain the source of truth. Owner-level and account-level views must reconcile back to the same overall income, bills, debt payments, interest, principal, and cash balance totals.

Income sources, debts, income deviations, debt deviations, and account transfers require valid account relationships before they can be saved. Inactive accounts remain valid for existing historical records, saved baselines, saved scenarios, and dashboard loads, but they are not selectable for new assignments.

Projection calculations are event-driven by source records. Income, debt, bill, and transfer events should respect start dates, end dates, payment dates where applicable, recurring pattern, and one-time behavior; monthly projection rows aggregate those events rather than defining their timing.

Account transfers are income-source records marked as transfers. They move cash between account owners for owner-level projection views, require different From and To accounts, and must not change Overall income, bills, debt payments, monthly surplus, or cash balance.
