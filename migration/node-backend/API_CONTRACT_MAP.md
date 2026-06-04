# Founded API Contract Migration Map

Status date: June 4, 2026

Current source of truth: FastAPI + SQLite.

Express migration status: Phase 4 read-only retrieval framework for foundational data entities. MongoDB models are connected to GET-only controllers for accounts, income, debts, and interest rates, but no write routes, calculations, projections, scenarios, dashboard aggregation, data migration, or data parity validation exists.

Allowed statuses:

- Not Started
- Scaffolded
- Migrated
- Validated
- Deferred

Allowed parity levels:

- None
- Contract
- Data
- Validated

## Route Contract Tracker

| Current FastAPI Route | Express Route Group | Migration Phase | Status | Parity Level | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET /health` | `src/routes/health.js` / health route | Phase 1-2 | Validated | Contract | Health remains operational and reports `phase-2-mongodb` plus safe database status. |
| `POST /account-balances` | `src/routes/accounts.js` / `AccountController` | Future write route migration | Not Started | None | Write behavior is not implemented in Phase 4. |
| `GET /account-balances` | `src/routes/accounts.js` / `AccountController` | Phase 4 read-only framework | Migrated | Contract | GET-only route calls `Account.find()` when MongoDB is connected; returns safe database status when unavailable. |
| `GET /account-balances/:id` | `src/routes/accounts.js` / `AccountController` | Phase 4 read-only framework | Migrated | Contract | GET-only route supports ObjectId or `legacyId` lookup. |
| `PATCH /account-balances/:id` | `src/routes/accounts.js` / `AccountController` | Future write route migration | Not Started | None | Write behavior and dependency checks are not implemented in Phase 4. |
| `DELETE /account-balances/:id` | `src/routes/accounts.js` / `AccountController` | Future write route migration | Not Started | None | Write behavior and dependency checks are not implemented in Phase 4. |
| `POST /income-sources` | `src/routes/income.js` / `IncomeController` | Future write route migration | Not Started | None | Write behavior and transfer validation are not implemented in Phase 4. |
| `GET /income-sources` | `src/routes/income.js` / `IncomeController` | Phase 4 read-only framework | Migrated | Contract | GET-only route calls `Income.find()` when MongoDB is connected; returns safe database status when unavailable. |
| `GET /income-sources/:id` | `src/routes/income.js` / `IncomeController` | Phase 4 read-only framework | Migrated | Contract | GET-only route supports ObjectId or `legacyId` lookup. |
| `PATCH /income-sources/:id` | `src/routes/income.js` / `IncomeController` | Future write route migration | Not Started | None | Write behavior and transfer validation are not implemented in Phase 4. |
| `DELETE /income-sources/:id` | `src/routes/income.js` / `IncomeController` | Future write route migration | Not Started | None | Write behavior is not implemented in Phase 4. |
| `POST /debts` | `src/routes/debts.js` / `DebtController` | Future write route migration | Not Started | None | Write behavior is not implemented in Phase 4. |
| `GET /debts` | `src/routes/debts.js` / `DebtController` | Phase 4 read-only framework | Migrated | Contract | GET-only route calls `Debt.find()` when MongoDB is connected; returns safe database status when unavailable. |
| `GET /debts/:id` | `src/routes/debts.js` / `DebtController` | Phase 4 read-only framework | Migrated | Contract | GET-only route supports ObjectId or `legacyId` lookup. Nested `interest_rates` remain a documented contract difference until response adaptation is explicitly approved. |
| `PATCH /debts/:id` | `src/routes/debts.js` / `DebtController` | Future write route migration | Not Started | None | Write behavior and payoff validation are not implemented in Phase 4. |
| `DELETE /debts/:id` | `src/routes/debts.js` / `DebtController` | Future write route migration | Not Started | None | Write behavior and interest-rate cleanup are not implemented in Phase 4. |
| `POST /interest-rates` | `src/routes/interestRates.js` / `InterestRateController` | Future write route migration | Not Started | None | Write behavior is not implemented in Phase 4. |
| `GET /interest-rates/debt/:debtId` | `src/routes/interestRates.js` / `InterestRateController` | Phase 4 read-only framework | Migrated | Contract | GET-only route calls `InterestRate.find()` by ObjectId or `legacy_debt_id`. |
| `PATCH /interest-rates/:id` | `src/routes/interestRates.js` / `InterestRateController` | Future write route migration | Not Started | None | Write behavior is not implemented in Phase 4. |
| `DELETE /interest-rates/:id` | `src/routes/interestRates.js` / `InterestRateController` | Future write route migration | Not Started | None | Write behavior is not implemented in Phase 4. |
| `POST /projections/baseline/generate` | `src/routes/projections.js` / `ProjectionController` | Deferred projection engine migration | Deferred | None | Explicitly deferred; no projection logic is migrated. |
| `POST /projections` | `src/routes/projections.js` / `ProjectionController` | Deferred saved projection migration | Deferred | None | Explicitly deferred; no saved projection write behavior is migrated. |
| `GET /projections` | `src/routes/projections.js` / `ProjectionController` | Deferred saved projection migration | Deferred | None | Explicitly deferred; saved projection retrieval remains scaffold-only. |
| `GET /projections/:id` | `src/routes/projections.js` / `ProjectionController` | Deferred saved projection migration | Deferred | None | Explicitly deferred; saved projection retrieval remains scaffold-only. |
| `DELETE /projections/:id` | `src/routes/projections.js` / `ProjectionController` | Deferred saved projection migration | Deferred | None | Explicitly deferred; no delete behavior is migrated. |
| `POST /projections/baseline/generate-and-save` | `src/routes/projections.js` / `ProjectionController` | Deferred projection engine migration | Deferred | None | Explicitly deferred; legacy route remains tracked for parity. |
| `POST /scenario/generate` | `src/routes/scenarios.js` / `ScenarioController` | Deferred scenario engine migration | Deferred | None | Explicitly deferred; no scenario merge logic is migrated. |
| `POST /scenario/save` | `src/routes/scenarios.js` / `ScenarioController` | Deferred scenario engine migration | Deferred | None | Explicitly deferred; no scenario save behavior is migrated. |
| `GET /scenario/:id` | `src/routes/scenarios.js` / `ScenarioController` | Deferred scenario route migration | Deferred | None | Explicitly deferred; saved scenario retrieval remains scaffold-only. |
| `POST /dashboard/:id/summary` | `src/routes/dashboard.js` / `DashboardController` | Deferred dashboard route migration | Deferred | None | Explicitly deferred; no dashboard summary aggregation is migrated. |
| `GET /dashboard/:id/charts` | `src/routes/dashboard.js` / `DashboardController` | Deferred dashboard route migration | Deferred | None | Explicitly deferred; no chart aggregation is migrated. |

## Phase 4 Data Availability Strategy

| State | Condition | Expected Express Behavior |
| --- | --- | --- |
| A | MongoDB is not configured | GET routes return `503` with `status: "database-unavailable"` and `database: "not-configured"`. The server does not crash. |
| B | MongoDB is configured but empty | List GET routes return valid empty arrays. Item GET routes return `404` when no matching document exists. No fake data is returned. |
| C | MongoDB is configured with data | GET routes return available MongoDB records. This is not data parity until imported data is validated against FastAPI outputs. |

## Contract Comparison

### Accounts

FastAPI response shape:

- `GET /account-balances` returns an array of account balance records.
- `GET /account-balances/{id}` returns one account balance record.
- Records use snake_case fields and numeric `id`.

Express response shape:

- `GET /account-balances` returns an array of MongoDB account documents when connected.
- `GET /account-balances/:id` returns one MongoDB account document by ObjectId or `legacyId` when connected.
- When MongoDB is unavailable, Express returns safe database status instead of attempting a query.

Differences and deferred items:

- Express documents may include MongoDB `_id`.
- Numeric `id` response adaptation is deferred.
- Data parity is not claimed because MongoDB data migration has not occurred.

### Income

FastAPI response shape:

- `GET /income-sources` returns an array of income source and account-transfer records.
- `GET /income-sources/{id}` returns one income source record.
- Records use snake_case fields and numeric `id`.

Express response shape:

- `GET /income-sources` returns an array of MongoDB income documents when connected.
- `GET /income-sources/:id` returns one MongoDB income document by ObjectId or `legacyId` when connected.

Differences and deferred items:

- Express documents may include MongoDB `_id`.
- Account reference response adaptation is deferred.
- Transfer validation and all write behavior are deferred.

### Debts

FastAPI response shape:

- `GET /debts` returns an array of debt records.
- `GET /debts/{id}` returns one debt record.
- Debt records include nested `interest_rates`.

Express response shape:

- `GET /debts` returns an array of MongoDB debt documents when connected.
- `GET /debts/:id` returns one MongoDB debt document by ObjectId or `legacyId` when connected.

Differences and deferred items:

- Nested `interest_rates` are not attached in Phase 4.
- Debt response adaptation and interest-rate embedding/population are deferred.
- No debt calculation, payoff, or projection behavior is migrated.

### Interest Rates

FastAPI response shape:

- `GET /interest-rates/debt/{debt_id}` returns interest-rate records for one debt.
- Records use snake_case fields and numeric ids.

Express response shape:

- `GET /interest-rates/debt/:debtId` returns MongoDB interest-rate documents by debt ObjectId or `legacy_debt_id` when connected.

Differences and deferred items:

- Express documents may include MongoDB `_id`.
- Numeric `id` response adaptation is deferred.
- Interest-rate write routes remain unimplemented.

## Phase 4 Guardrails

- Route groups for accounts, income, debts, and interest rates define GET routes only.
- These controllers import Mongoose models only for read operations.
- No POST, PATCH, PUT, or DELETE routes are defined for these groups.
- Projections, scenarios, and dashboard remain deferred scaffold route groups.
- No calculations, projection generation, scenario generation, dashboard aggregation, demo data migration, or frontend rewiring exists in Phase 4.
