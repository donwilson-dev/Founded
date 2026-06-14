# Founded

Founded is a financial planning app for income, debt, projections, scenarios, debt payoff forecasting, and dashboard-ready data.

The active V1 runtime is:

- Node.js/Express backend in `migration/node-backend`
- MongoDB Community Server database
- React/Vite frontend in `frontend`

The legacy FastAPI + SQLite implementation remains in the repository for historical parity checks and Python regression tests only. It is not the active application runtime.

## Setup

```powershell
cd migration\node-backend
npm install

cd ..\..\frontend
npm install
```

Ensure MongoDB Community Server is running locally. The native backend reads `MONGODB_URI` from `migration/node-backend/.env`; the standard local database is `mongodb://127.0.0.1:27017/founded_migration`.

## Run Backend

```powershell
cd migration\node-backend
npm run dev
```

The native backend health endpoint is available at `http://127.0.0.1:4000/health`.

## Frontend

```powershell
cd frontend
npm run dev -- --port 5174
```

The React app talks to the native Node backend at `http://127.0.0.1:4000` by default. Override with `VITE_API_BASE_URL` if needed.

## Validation

```powershell
cd migration\node-backend
npm test
npm run dataset:verify
npm run projection-payloads:verify

cd ..\..\frontend
npm run build

cd ..
.\.venv\Scripts\python.exe -m pytest
```

The Python test suite is retained as a legacy parity and regression safety check while the active runtime remains Node.js/Express + MongoDB.

## Dataset Version 1.0

```powershell
cd migration\node-backend
npm run dataset:verify
```

The native MongoDB dataset uses the official portfolio-safe demonstration records:

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
