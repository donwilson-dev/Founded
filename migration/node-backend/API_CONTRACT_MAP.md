# Founded API Contract Migration Map

Status date: June 4, 2026

Current source of truth: FastAPI + SQLite.

Express migration status: Phase 3 contract scaffold only. Route groups and controller placeholders exist, but no CRUD, MongoDB access, business logic, calculations, projections, or FastAPI endpoint behavior has been migrated.

Allowed statuses:

- Not Started
- Scaffolded
- Migrated
- Validated

## Route Contract Tracker

| Current FastAPI Route | Express Route Group | Migration Phase | Status | Notes |
| --- | --- | --- | --- | --- |
| `GET /health` | `src/routes/health.js` / health route | Phase 1-2 | Validated | Health remains operational and reports `phase-2-mongodb` plus safe database status. |
| `POST /account-balances` | `src/routes/accounts.js` / `AccountController` | Future CRUD route migration | Scaffolded | Create account balance route exists only as a route-group placeholder returning 501. |
| `GET /account-balances` | `src/routes/accounts.js` / `AccountController` | Future CRUD route migration | Scaffolded | List account balances route exists only as a route-group placeholder returning 501. |
| `GET /account-balances/:id` | `src/routes/accounts.js` / `AccountController` | Future CRUD route migration | Scaffolded | Retrieve account balance route exists only as a route-group placeholder returning 501. |
| `PATCH /account-balances/:id` | `src/routes/accounts.js` / `AccountController` | Future CRUD route migration | Scaffolded | Update account balance route exists only as a route-group placeholder returning 501. |
| `DELETE /account-balances/:id` | `src/routes/accounts.js` / `AccountController` | Future CRUD route migration | Scaffolded | Delete account balance route exists only as a route-group placeholder returning 501; account dependency checks are not migrated. |
| `POST /income-sources` | `src/routes/income.js` / `IncomeController` | Future CRUD route migration | Scaffolded | Create income or account-transfer route exists only as a route-group placeholder returning 501. |
| `GET /income-sources` | `src/routes/income.js` / `IncomeController` | Future CRUD route migration | Scaffolded | List income sources route exists only as a route-group placeholder returning 501. |
| `GET /income-sources/:id` | `src/routes/income.js` / `IncomeController` | Future CRUD route migration | Scaffolded | Retrieve income source route exists only as a route-group placeholder returning 501. |
| `PATCH /income-sources/:id` | `src/routes/income.js` / `IncomeController` | Future CRUD route migration | Scaffolded | Update income source route exists only as a route-group placeholder returning 501; transfer validation is not migrated. |
| `DELETE /income-sources/:id` | `src/routes/income.js` / `IncomeController` | Future CRUD route migration | Scaffolded | Delete income source route exists only as a route-group placeholder returning 501. |
| `POST /debts` | `src/routes/debts.js` / `DebtController` | Future CRUD route migration | Scaffolded | Create debt route exists only as a route-group placeholder returning 501. |
| `GET /debts` | `src/routes/debts.js` / `DebtController` | Future CRUD route migration | Scaffolded | List debts route exists only as a route-group placeholder returning 501. |
| `GET /debts/:id` | `src/routes/debts.js` / `DebtController` | Future CRUD route migration | Scaffolded | Retrieve debt route exists only as a route-group placeholder returning 501. |
| `PATCH /debts/:id` | `src/routes/debts.js` / `DebtController` | Future CRUD route migration | Scaffolded | Update debt route exists only as a route-group placeholder returning 501; payoff target validation is not migrated. |
| `DELETE /debts/:id` | `src/routes/debts.js` / `DebtController` | Future CRUD route migration | Scaffolded | Delete debt route exists only as a route-group placeholder returning 501; interest-rate cleanup is not migrated. |
| `POST /interest-rates` | `src/routes/interestRates.js` / `InterestRateController` | Future CRUD route migration | Scaffolded | Create interest-rate route exists only as a route-group placeholder returning 501. |
| `GET /interest-rates/debt/:debtId` | `src/routes/interestRates.js` / `InterestRateController` | Future CRUD route migration | Scaffolded | List rates for a debt route exists only as a route-group placeholder returning 501. |
| `PATCH /interest-rates/:id` | `src/routes/interestRates.js` / `InterestRateController` | Future CRUD route migration | Scaffolded | Update interest-rate route exists only as a route-group placeholder returning 501. |
| `DELETE /interest-rates/:id` | `src/routes/interestRates.js` / `InterestRateController` | Future CRUD route migration | Scaffolded | Delete interest-rate route exists only as a route-group placeholder returning 501. |
| `POST /projections/baseline/generate` | `src/routes/projections.js` / `ProjectionController` | Future projection engine migration | Scaffolded | Baseline generation route exists only as a route-group placeholder returning 501; no projection logic is migrated. |
| `POST /projections` | `src/routes/projections.js` / `ProjectionController` | Future saved projection migration | Scaffolded | Save projection route exists only as a route-group placeholder returning 501; overwrite behavior is not migrated. |
| `GET /projections` | `src/routes/projections.js` / `ProjectionController` | Future saved projection migration | Scaffolded | List saved projections route exists only as a route-group placeholder returning 501. |
| `GET /projections/:id` | `src/routes/projections.js` / `ProjectionController` | Future saved projection migration | Scaffolded | Retrieve saved projection route exists only as a route-group placeholder returning 501. |
| `DELETE /projections/:id` | `src/routes/projections.js` / `ProjectionController` | Future saved projection migration | Scaffolded | Delete saved projection route exists only as a route-group placeholder returning 501. |
| `POST /projections/baseline/generate-and-save` | `src/routes/projections.js` / `ProjectionController` | Future projection engine migration | Scaffolded | Legacy generate-and-save route remains tracked for parity; placeholder only. |
| `POST /scenario/generate` | `src/routes/scenarios.js` / `ScenarioController` | Future scenario engine migration | Scaffolded | Scenario generation route exists only as a route-group placeholder returning 501; no scenario merge logic is migrated. |
| `POST /scenario/save` | `src/routes/scenarios.js` / `ScenarioController` | Future scenario engine migration | Scaffolded | Scenario save route exists only as a route-group placeholder returning 501; no save behavior is migrated. |
| `GET /scenario/:id` | `src/routes/scenarios.js` / `ScenarioController` | Future scenario route migration | Scaffolded | Saved scenario retrieval route exists only as a route-group placeholder returning 501. |
| `POST /dashboard/:id/summary` | `src/routes/dashboard.js` / `DashboardController` | Future dashboard route migration | Scaffolded | Dashboard summary route exists only as a route-group placeholder returning 501; no summary logic is migrated. |
| `GET /dashboard/:id/charts` | `src/routes/dashboard.js` / `DashboardController` | Future dashboard route migration | Scaffolded | Dashboard chart route exists only as a route-group placeholder returning 501; no chart logic is migrated. |

## Phase 3 Scaffold Notes

- Route groups are registered by production-style URL prefixes so later phases can migrate endpoints incrementally.
- Controller files export placeholder handlers only.
- Placeholder handlers do not import Mongoose models.
- Placeholder handlers do not query or write MongoDB.
- Placeholder handlers do not replicate FastAPI route behavior.
- Health remains separate and keeps the Phase 2 response shape until a future approved phase changes it.
