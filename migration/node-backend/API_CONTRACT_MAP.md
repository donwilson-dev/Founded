# Founded API Contract Migration Map

Status date: June 5, 2026

Current source of truth: FastAPI + SQLite.

Express migration status: Phase 9A saved projection and scenario payload migration. MongoDB models are connected to GET-only controllers for accounts, income, debts, interest rates, saved projections, and scenarios. Saved projection and scenario `generated_rows`, `assumptions_snapshot`, and metadata are migrated from FastAPI + SQLite and validated for read-path payload parity. Dashboard remains a `501` placeholder. No write behavior, calculations, projection generation, scenario execution, or dashboard aggregation exists.

Allowed statuses:

- Not Started
- Scaffolded
- Retrieval Implemented
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
| `POST /projections/baseline/generate` | No Express route in Phase 7 | Deferred projection engine migration | Not Started | None | Explicitly deferred; no projection generation route or projection logic is migrated. |
| `POST /projections` | No Express route in Phase 7 | Future write route migration | Not Started | None | Saved projection write behavior is not implemented. |
| `GET /projections` | `src/routes/projections.js` / `ProjectionController` | Phase 7 read-only retrieval framework | Retrieval Implemented | Contract | GET-only route calls `SavedProjection.find()` when MongoDB is connected; returns safe database status when unavailable. |
| `GET /projections/:id` | `src/routes/projections.js` / `ProjectionController` | Phase 7 read-only retrieval framework | Retrieval Implemented | Contract | GET-only route supports ObjectId or `legacyId` lookup. Stored projection values are returned as-is and are never recalculated. |
| `DELETE /projections/:id` | No Express route in Phase 7 | Future write route migration | Not Started | None | Saved projection delete behavior is not implemented. |
| `POST /projections/baseline/generate-and-save` | No Express route in Phase 7 | Deferred projection engine migration | Not Started | None | Legacy generate-and-save route remains tracked for future parity but is not implemented. |
| `POST /scenario/generate` | No Express route in Phase 7 | Deferred scenario engine migration | Not Started | None | Scenario generation and merge logic are not implemented. |
| `POST /scenario/save` | No Express route in Phase 7 | Future write route migration | Not Started | None | Scenario save behavior is not implemented. |
| `GET /scenario/:id` | `GET /scenarios/:id` via `src/routes/scenarios.js` / `ScenarioController` | Phase 7 read-only retrieval framework | Retrieval Implemented | Contract | Express uses the plural route group and retrieves stored scenario documents only. Scenario values are never applied or recalculated. |
| Scenario projection subset | `GET /scenarios` via `src/routes/scenarios.js` / `ScenarioController` | Phase 9A payload migration | Validated | Validated | GET-only route returns stored saved projection documents where `projection_type` is `scenario`. Stored scenario payloads are migrated from FastAPI + SQLite and validated for `generated_rows`, `assumptions_snapshot`, and metadata parity. |
| `POST /dashboard/:id/summary` | `src/routes/dashboard.js` / `DashboardController` | Phase 6 contract scaffold | Scaffolded | None | Route group placeholder returns `501`; no dashboard summary aggregation is migrated. |
| `GET /dashboard/:id/charts` | `src/routes/dashboard.js` / `DashboardController` | Phase 6 contract scaffold | Scaffolded | None | Route group placeholder returns `501`; no chart aggregation is migrated. |

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

### Saved Projections

FastAPI response shape:

- `GET /projections` returns an array of saved projection summaries with numeric `id`, `title`, `projection_type`, `created_at`, `updated_at`, and `notes`.
- `GET /projections/{id}` returns one saved projection record with numeric `id`, `title`, `projection_type`, `notes`, `assumptions_snapshot`, `generated_rows`, `created_at`, and `updated_at`.

Express response shape:

- `GET /projections` returns stored MongoDB saved projection documents when connected.
- `GET /projections/:id` returns one stored MongoDB saved projection document by ObjectId or `legacyId` when connected.
- When MongoDB is unavailable, Express returns safe database status instead of attempting a query.

Differences and deferred items:

- Express documents may include MongoDB `_id`.
- Numeric `id` response adaptation is deferred.
- List response summary shaping is deferred; Phase 7 returns stored documents only.
- Stored `assumptions_snapshot` and `generated_rows` are returned as stored and are never regenerated, refreshed, or recalculated.
- Projection generation, generate-and-save, save, delete, and financial validation remain unimplemented. Stored saved projection payload data parity is validated after Phase 9A migration.

### Scenarios

FastAPI response shape:

- `GET /scenario/{projection_id}` returns one saved projection record only when `projection_type` is `scenario`.
- Scenario list behavior is currently represented through saved projection listing and frontend filtering.

Express response shape:

- `GET /scenarios` returns stored MongoDB saved projection documents where `projection_type` is `scenario` when connected.
- `GET /scenarios/:id` returns one stored MongoDB scenario document by ObjectId or `legacyId` when connected and filters to `projection_type: "scenario"`.
- When MongoDB is unavailable, Express returns safe database status instead of attempting a query.

Differences and deferred items:

- Express uses plural `/scenarios` route grouping for the migration backend.
- Express documents may include MongoDB `_id`.
- Numeric `id` response adaptation is deferred.
- Scenario generation, scenario save, scenario application, scenario impact calculation, and financial validation remain unimplemented. Stored scenario payload data parity is validated after Phase 9A migration.
- Stored scenario `assumptions_snapshot` and `generated_rows` are returned as stored and are never recomputed.

## Phase 7 Data Availability Strategy

| State | Condition | Expected Express Behavior |
| --- | --- | --- |
| A | MongoDB is not configured | Scenario and projection GET routes return `503` with `status: "database-unavailable"` and `database: "not-configured"`. The server does not crash. |
| B | MongoDB is configured but empty | List GET routes return valid empty arrays. Item GET routes return `404` when no matching document exists. No fake data is returned. |
| C | MongoDB is configured with data | GET routes return stored MongoDB scenario and saved projection documents. This is documented for future verification only; Dataset Version 1.0 import remains deferred. |

## Phase 7 Guardrails

- Route groups for accounts, income, debts, and interest rates define GET routes only.
- These controllers import Mongoose models only for read operations.
- Scenario and projection route groups define only `GET /scenarios`, `GET /scenarios/:id`, `GET /projections`, and `GET /projections/:id`.
- Scenario and projection controllers import Mongoose models only for read operations.
- No POST, PATCH, PUT, or DELETE scenario/projection routes are defined in Phase 7.
- Dashboard remains a `501` placeholder route group from Phase 6.
- No calculations, projection generation, projection refresh, scenario generation, scenario execution, dashboard aggregation, demo data migration, or frontend rewiring exists in Phase 7.

## Dataset Readiness

Dataset Version 1.0 is documented in `MIGRATION_DATASET_AUDIT.md`.

Dataset readiness status:

- Canonical dataset: documented.
- Expected counts: documented.
- Collection mappings: documented.
- Relationship verification rules: documented.
- Preview tooling: available.
- Verification tooling: available.
- MongoDB import: deferred.
- Data parity: not claimed.
- Financial validation: not performed.

This section documents dataset readiness only. It does not change API parity levels, route migration status, data parity status, or validation status.
