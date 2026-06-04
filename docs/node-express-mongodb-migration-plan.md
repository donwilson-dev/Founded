# Node.js / Express + MongoDB Migration Plan

Planning date: June 4, 2026

Current source commit: `189ec6d`

Current branch: `main`

Planning status: assessment and blueprint only. No migration execution is included in this document.

## Migration Ground Rules

1. Calculation freeze: port and validate first, improve later. FastAPI calculation outputs are the source of truth.
2. API contract preservation: preserve existing frontend request and response shapes whenever practical.
3. Source-of-truth rule: FastAPI + SQLite remains authoritative until the Node.js + Express + MongoDB implementation passes validation.
4. No behavioral changes during migration: route, schema, model, and calculation changes must be parity-focused.
5. Exact demo dataset parity is required before the migrated stack can be considered successful.

## Current Architecture Snapshot

Founded currently uses a React/Vite frontend, a FastAPI backend, SQLAlchemy models, Pydantic schemas, SQLite persistence, and a Python calculation service. The frontend talks to the backend through `frontend/src/api/foundedApi.js`, which centralizes request paths and payload adaptation.

The backend is organized around small FastAPI routers for source records, saved projections, scenarios, and dashboard summaries. Projection generation and dashboard data are service-layer behavior, not route-local behavior. Saved projections store both generated rows and the assumption snapshots used to generate them.

Application startup initializes SQLite tables and applies lightweight SQLite compatibility column checks in `app/database.py`. There is no explicit migration framework yet.

## Authoritative Source Inventory

| Area | Authoritative Files | Migration Notes |
| --- | --- | --- |
| Frontend routes and app shell | `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/components/Sidebar.jsx` | Route names and navigation should remain unchanged during backend migration. |
| Frontend API layer | `frontend/src/api/foundedApi.js` | Primary API contract source for Express parity. Preserve function behavior and error assumptions. |
| Frontend pages | `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/BaselineBuilder.jsx`, `frontend/src/pages/ScenarioBuilder.jsx`, `frontend/src/pages/Home.jsx` | Do not rework page behavior during backend migration except backend base URL if required. |
| Frontend shared UI | `frontend/src/components/*.jsx`, `frontend/src/utils/*.js` | Existing formatting, tables, exports, inline updates, and confirming actions should remain behaviorally stable. |
| FastAPI app entry | `app/main.py` | Defines CORS, health route, and router registration. |
| Database setup | `app/database.py` | SQLite connection, table creation, and compatibility column guards. |
| Database models | `app/models.py` | Source of truth for tables, enums, relationships, and saved projection persistence. |
| API schemas | `app/schemas.py` | Source of truth for request validation and response model shape. |
| API routes | `app/routers/*.py` | Source of truth for current HTTP routes and status behavior. |
| Calculation engine | `app/services/calculations.py` | Critical source of truth for recurrence, interest, payoff, account projection, baseline, scenario, dashboard, and milestone logic. |
| Account integrity | `app/services/account_integrity.py` | Source of truth for account assignment validation and delete protection. |
| Saved projections | `app/services/saved_projections.py` | Source of truth for title overwrite behavior. |
| Demo dataset | `app/seed.py`, `README.md` validation table | Source of truth for migration acceptance data. |
| Tests | `tests/test_api.py`, `tests/test_calculations.py` | Current parity guardrails. Extend before and during migration. |

## Route Migration Matrix

| Method | Current FastAPI Route | Purpose | Dependencies | Future Express Route | Request Shape | Response Shape | Contract Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/health` | Health check | `app/main.py` | `GET /health` | none | `{ "status": "ok" }` | Preserve exactly. |
| POST | `/account-balances` | Create account balance | `AccountBalanceCreate`, `AccountBalance` | `POST /account-balances` | account payload | account document | Preserve snake_case fields. |
| GET | `/account-balances` | List account balances | `AccountBalance` | `GET /account-balances` | none | account array | Preserve order if possible: date desc, id desc. |
| GET | `/account-balances/:id` | Retrieve account balance | `AccountBalance` | `GET /account-balances/:id` | path id | account document | Preserve 404 message intent. |
| PATCH | `/account-balances/:id` | Update account balance | `AccountBalanceUpdate` | `PATCH /account-balances/:id` | partial account payload | account document | Preserve partial-update semantics. |
| DELETE | `/account-balances/:id` | Delete account balance | `ensure_account_can_be_deleted` | `DELETE /account-balances/:id` | path id | 204 empty | Preserve dependency protection. |
| POST | `/income-sources` | Create income source or transfer | `IncomeSourceCreate`, account validation | `POST /income-sources` | income payload | income document | Preserve transfer validation. |
| GET | `/income-sources` | List income sources | `IncomeSource` | `GET /income-sources` | none | income array | Preserve id order. |
| GET | `/income-sources/:id` | Retrieve income source | `IncomeSource` | `GET /income-sources/:id` | path id | income document | Preserve response fields. |
| PATCH | `/income-sources/:id` | Update income source | `IncomeSourceUpdate`, account validation | `PATCH /income-sources/:id` | partial income payload | income document | Preserve end-date validation. |
| DELETE | `/income-sources/:id` | Delete income source | `IncomeSource` | `DELETE /income-sources/:id` | path id | 204 empty | Preserve behavior. |
| POST | `/debts` | Create debt or bill | `DebtCreate`, account validation | `POST /debts` | debt payload | debt document with `interest_rates` | Preserve Other-debt rules in frontend and backend validation. |
| GET | `/debts` | List debts | `Debt`, `InterestRate` | `GET /debts` | none | debt array with `interest_rates` | Preserve nested rates. |
| GET | `/debts/:id` | Retrieve debt | `Debt`, `InterestRate` | `GET /debts/:id` | path id | debt document with `interest_rates` | Preserve nested rates. |
| PATCH | `/debts/:id` | Update debt | `DebtUpdate`, account validation | `PATCH /debts/:id` | partial debt payload | debt document | Preserve payoff date validation. |
| DELETE | `/debts/:id` | Delete debt | `Debt` | `DELETE /debts/:id` | path id | 204 empty | Must also handle rate cleanup in MongoDB design. |
| POST | `/interest-rates` | Create APR schedule row | `InterestRateCreate`, `Debt` | `POST /interest-rates` | rate payload | rate document | Preserve missing-debt 404. |
| GET | `/interest-rates/debt/:debtId` | List rates for debt | `InterestRate` | `GET /interest-rates/debt/:debtId` | path debt id | rate array | Preserve start_date ordering. |
| PATCH | `/interest-rates/:id` | Update rate | `InterestRateUpdate` | `PATCH /interest-rates/:id` | partial rate payload | rate document | Preserve date range validation. |
| DELETE | `/interest-rates/:id` | Delete rate | `InterestRate` | `DELETE /interest-rates/:id` | path id | 204 empty | Preserve behavior. |
| POST | `/projections/baseline/generate` | Generate unsaved baseline | `current_financial_inputs`, `generate_baseline_projection` | `POST /projections/baseline/generate` | `ProjectionGenerateRequest` | generated projection object | Critical parity route. |
| POST | `/projections` | Save projection | `SaveProjectionRequest`, `save_or_update_projection` | `POST /projections` | save projection payload | saved projection document | Preserve overwrite-by-title-and-type behavior. |
| GET | `/projections` | List saved projections | `SavedProjection` | `GET /projections` | none | saved projection summaries | Preserve updated_at desc sorting. |
| GET | `/projections/:id` | Retrieve saved projection | `SavedProjection` | `GET /projections/:id` | path id | full saved projection | Preserve generated rows and snapshots. |
| DELETE | `/projections/:id` | Delete saved projection | `SavedProjection` | `DELETE /projections/:id` | path id | 204 empty | Preserve behavior. |
| POST | `/projections/baseline/generate-and-save` | Generate and save baseline | `generate_baseline_projection`, `save_or_update_projection` | `POST /projections/baseline/generate-and-save` | body plus `title`/`notes` query params | saved projection document | Keep route until explicitly retired. |
| POST | `/scenario/generate` | Generate unsaved scenario | saved baseline, `generate_scenario_projection` | `POST /scenario/generate` | `ScenarioGenerateRequest` | scenario projection object | Critical parity route. |
| POST | `/scenario/save` | Generate and save scenario | saved baseline, `save_or_update_projection` | `POST /scenario/save` | `ScenarioGenerateRequest` | saved scenario document | Preserve title overwrite behavior. |
| GET | `/scenario/:id` | Retrieve saved scenario | `SavedProjection` | `GET /scenario/:id` | path id | saved scenario document | Preserve scenario-type guard. |
| POST | `/dashboard/:id/summary` | Dashboard summary and rows | `dashboard_summary` | `POST /dashboard/:id/summary` | empty object today | dashboard summary object | Preserve POST contract even though payload is empty. |
| GET | `/dashboard/:id/charts` | Chart datasets | `dashboard_summary` | `GET /dashboard/:id/charts` | path id | datasets object | Preserve dataset names. |

## Data Model Migration Matrix

| Entity | Current SQLite Table | Future MongoDB Collection | Relationships | Indexes | Embedding vs Referencing | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Account balances | `account_balances` | `accountBalances` | Referenced by income/debt and transfer fields | `_id`, optional `active`, optional owner | Reference by `_id` from income and debts | Store `legacyId` during migration validation to preserve snapshots and tests. |
| Income sources | `income_sources` | `incomeSources` | References account, from account, to account | `_id`, `account_balance_id`, `from_account_id`, `to_account_id`, `active` | Reference accounts; do not embed accounts | Transfers remain income-source records with `is_account_transfer`. |
| Debts | `debts` | `debts` | References account; has interest rates | `_id`, `account_balance_id`, `debt_type`, `active`, `priority_number` | Reference account; rates can embed or reference | Prefer embedded `interest_rates` for active app reads, but preserve route compatibility. |
| Interest rates | `interest_rates` | `interestRates` or embedded `debts.interest_rates` | Belongs to debt | `debt_id`, `start_date` | Conditional: embed for read efficiency, reference for endpoint parity | Recommended first migration: separate collection for API parity; consider embedding after validation. |
| Saved projections | `saved_projections` | `savedProjections` | Contains snapshots and generated rows | `_id`, `projection_type`, `title`, `updated_at` unique compound candidate | Store generated rows and snapshots in document | Large documents are acceptable for current 60-300 month scope; monitor BSON size. |
| Scenarios | Currently saved projections with `projection_type=scenario` | `savedProjections` | Scenario data in `assumptions_snapshot` | same as saved projections | Same collection | Do not split until parity is complete. |

## MongoDB Collection Design Review

Recommended collection names:

- `accountBalances`
- `incomeSources`
- `debts`
- `interestRates`
- `savedProjections`

Recommended shared document fields:

- `_id`: MongoDB ObjectId.
- `legacyId`: numeric SQLite id during migration validation.
- `createdAt` and `updatedAt`: use where the current model has timestamps or where future ordering benefits.
- Date values: store as ISO date strings or BSON Date consistently. For parity, prefer ISO `YYYY-MM-DD` strings at API boundaries and convert internally.

Recommended collection details:

| Collection | Required Fields | Optional Fields | Validation |
| --- | --- | --- | --- |
| `accountBalances` | `name`, `amount`, `date`, `active` | `owner`, `account_type`, `notes`, `legacyId` | amount >= 0; name non-empty. |
| `incomeSources` | `label`, `amount`, `start_date`, `frequency`, `active`, `is_account_transfer` | `account_balance_id`, `from_account_id`, `to_account_id`, `end_date`, `notes`, `legacyId` | amount >= 0; transfer requires distinct from/to accounts; non-transfer requires account. |
| `debts` | `name`, `debt_type`, `starting_balance`, `current_balance`, `minimum_monthly_payment`, `start_date`, `active` | `account_balance_id`, `planned_extra_payment`, `recurrence`, `payment_due_day`, `payment_date`, `payoff_target_date`, `priority_number`, `notes`, `legacyId` | non-negative money fields; payoff target cannot precede start date. |
| `interestRates` | `debt_id`, `apr_percentage`, `start_date` | `end_date`, `notes`, `legacyId` | APR >= 0; end date cannot precede start date. |
| `savedProjections` | `title`, `projection_type`, `assumptions_snapshot`, `generated_rows` | `notes`, `created_at`, `updated_at`, `legacyId` | title non-empty; generated rows array; projection type enum. |

Recommended indexes:

- `savedProjections`: `{ projection_type: 1, title: 1 }`, unique if overwrite semantics are enforced by update.
- `savedProjections`: `{ updated_at: -1 }`.
- `interestRates`: `{ debt_id: 1, start_date: 1 }`.
- `incomeSources`: `{ active: 1, id: 1 }` or `{ active: 1, legacyId: 1 }` during migration.
- `debts`: `{ active: 1, priority_number: 1 }`.
- `accountBalances`: `{ active: 1, owner: 1 }`.

Desktop compatibility:

- MongoDB Atlas or remote MongoDB is easy for hosted demos but not ideal for offline desktop use.
- Embedded MongoDB is heavy for desktop distribution.
- If offline desktop becomes a hard requirement, reassess whether the Node backend should use a local embedded document store, SQLite, or a packaged Mongo-compatible alternative.

## Calculation Engine Assessment

Authoritative file: `app/services/calculations.py`.

Critical functions and purpose:

- Date utilities: `parse_date`, `first_of_month`, `add_months`, `last_of_month`, `inclusive_month_count`, `month_range`.
- Recurrence: `normalized_frequency`, `occurrence_count_for_month`.
- APR and debt classification: `applicable_apr`, `debt_apr`, `is_bill`, `is_true_debt`.
- Income and payment amounts: `monthly_income_amount`, `base_actual_payment`, `scheduled_actual_payment`, `debt_payment_active_for_month`.
- Debt labels: `debt_column_labels`, `debt_type_label`, `payment_label`.
- Interest: `monthly_interest`.
- Payoff metrics: `calculate_payoff_metrics`.
- Scenario merging: `merge_assumption_collection`.
- Snapshotting: `snapshot_assumptions`, `json_ready`, `as_dict`.
- Account projections: `generate_account_projection_rows`.
- Baseline projections: `generate_baseline_projection`.
- Scenario projections: `generate_scenario_projection`.
- Dashboard and milestones: `dashboard_summary`, `milestone_dataset`.
- Compatibility helpers: Remaining Cash fallbacks in dashboard and payoff paths must remain during migration.

Inputs:

- Income sources, debts, interest rates, account balances.
- Projection start month, month count or end month.
- Saved baseline rows and assumptions for scenario generation.
- Scenario income, debt, and interest rate overrides.

Outputs:

- `generated_rows`, `assumptions_snapshot`, `account_projection_rows`, `scenario_account_projection_rows`, `summary`, dashboard datasets.

High-risk logic:

- Occurrence-based weekly, bi-weekly, first-and-fifteenth recurrence.
- Other debt bill handling versus APR-bearing payoff debt.
- Account transfer movement without household total changes.
- Scenario merge and override identity matching.
- Debt column label collision logic.
- Payoff helper using monthly surplus and rollover.
- Dashboard scenario suffix handling.
- Saved projection JSON snapshots and date serialization.

Migration rule:

Port this file directly to JavaScript first. Do not refactor while porting. Add parity tests around the direct port before any cleanup.

## Projection Engine Assessment

Baseline projection flow:

1. Frontend calls `foundedApi.generateBaselineProjection`.
2. FastAPI route `/projections/baseline/generate` loads current inputs using `current_financial_inputs`.
3. `generate_baseline_projection` aggregates month rows, account rows, and payoff summary.
4. Frontend may save the result through `/projections`.
5. `save_or_update_projection` overwrites by same title and projection type.

Scenario projection flow:

1. Frontend selects a saved baseline.
2. Scenario Builder loads baseline through `/projections/:id`.
3. Frontend calls `/scenario/generate` or `/scenario/save`.
4. `prepared_baseline_projection` uses saved rows or recomputes from assumptions.
5. `generate_scenario_projection` merges overrides, generates Scenario+ rows, and merges `+` values into baseline rows.
6. Scenario save stores the generated rows and scenario assumptions as a saved projection.

Dashboard projection display:

1. Dashboard lists saved projections.
2. Dashboard loads selected projection and calls `POST /dashboard/:id/summary`.
3. Dashboard uses `projection_rows`, `summary`, and `datasets` from `dashboard_summary`.

Exports/report dependency:

- Dashboard export behavior is frontend-side and depends on the loaded projection, assumptions, rows, account balances, income, debts, deviations, and projection table column semantics.
- Migration should not move export builders until backend parity is complete.

## API Contract Preservation Review

Primary API call location: `frontend/src/api/foundedApi.js`.

Contract expectations:

- API base URL defaults to `http://127.0.0.1:8000` and can be overridden by `VITE_API_BASE_URL`.
- Requests send JSON with `Content-Type: application/json`.
- Error handling expects JSON `detail` or falls back to HTTP status text.
- 204 responses return `null`.
- Date values are sent as strings, generally `YYYY-MM-DD`.
- Backend field names are snake_case.
- Projection row keys use display-style labels such as `Income`, `Total Debt Payments`, `Monthly Surplus`, `Cash Balance`, and scenario `+` suffixes.

Frontend dependencies on backend naming:

- `Dashboard.jsx` expects saved projection summaries, full saved projection rows, dashboard `summary`, `datasets`, and `projection_rows`.
- `BaselineBuilder.jsx` expects CRUD lists, nested debt `interest_rates`, generated baseline projections, saved projection overwrite behavior, and dashboard summary refresh.
- `ScenarioBuilder.jsx` expects saved baseline rows and assumptions, scenario generate/save responses, and saved scenario retrieval.
- `ProjectionTable.jsx` and export code expect current projection row field names.

Potential contract changes:

- MongoDB `_id` should not leak as the only identifier until frontend is prepared. Recommended Express responses should expose `id` as a stable string while retaining `_id` internally.
- If `created_at` and `updated_at` become ISO strings with timezone differences, frontend sorting and display should be validated.
- If ObjectId strings replace numeric ids, frontend `Number(id)` conversions in scenario payload creation must be addressed. Prefer API compatibility adapter that accepts numeric legacy ids during migration or update frontend in a dedicated API-rewire phase.

## Migration Test Strategy

Current coverage:

- `tests/test_api.py`: CRUD routes, projections, scenarios, account assignment validation, saved projection overwrite, dashboard API behavior.
- `tests/test_calculations.py`: recurrence, payoff, interest, other debt, scenario alignment, account transfers, dashboard summary, table semantics, and helper behavior.

Missing or recommended migration-specific coverage:

- Golden-file tests for all four demo projections.
- Route contract snapshot tests comparing FastAPI and Express responses.
- MongoDB model validation tests for each collection.
- Scenario save/load/delete parity tests in Express.
- Dashboard summary parity tests for baseline and scenarios.
- Account transfer owner/account filtering parity tests.
- Export parity smoke tests if exports become backend-owned later.
- ObjectId/id compatibility tests.

Migration validation approach:

1. Freeze FastAPI demo outputs as fixtures.
2. Port calculation engine to JavaScript.
3. Run JavaScript calculation outputs against the same fixtures.
4. Run Express route responses against FastAPI route response snapshots.
5. Validate dashboard and scenario data in the frontend only after backend parity passes.

## Migration Validation Acceptance Criteria

The official January 2026 demo dataset must match exactly.

| Projection | Monthly Surplus | Cash Balance | Total Debt Balance | Total Debt Payments | Bills | Principal | Interest |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Demo Household Baseline | 8670.00 | 39070.00 | 45648.21 | 1295.00 | 635.00 | 1051.79 | 243.21 |
| Demo Debt Reduction Scenario | 8405.00 | 38805.00 | 45348.21 | 1595.00 | 600.00 | 1351.79 | 243.21 |
| Demo Income Increase Scenario | 9370.00 | 39770.00 | 45648.21 | 1295.00 | 635.00 | 1051.79 | 243.21 |
| Demo Emergency Expense Scenario | 8670.00 | 39070.00 | 45648.21 | 1295.00 | 635.00 | 1051.79 | 243.21 |

Validation rule:

- Values must match exactly to two decimal places.
- Any variance must be documented, reproducible, explained, and explicitly approved before migration can pass.

## Migration Phase Plan

| Phase | Name | Objective | Risk |
| --- | --- | --- | --- |
| 1 | Express backend skeleton | Create Express app, health route, CORS, config, local dev scripts. | Medium |
| 2 | MongoDB models and connection | Add Mongo connection, collections, validation, indexes, and seed loading. | High |
| 3 | Route migration | Port CRUD and saved projection routes while preserving contracts. | Medium |
| 4 | Calculation engine JavaScript port | Directly port `calculations.py` to JS and add parity tests. | Critical |
| 5 | Projection engine port | Wire baseline/scenario/dashboard routes to JS calculation engine. | Critical |
| 6 | Frontend API rewire if required | Adjust base URL or id handling only if Express contract cannot be identical. | Medium |
| 7 | Demo dataset migration | Load official demo data into MongoDB and save all four projections. | High |
| 8 | Migration validation | Compare demo values, route snapshots, and dashboard data. | Critical |
| 9 | Gap remediation | Fix documented parity gaps only. | High |
| 10 | Release readiness review | Decide whether Express/Mongo replaces FastAPI/SQLite. | Medium |

Recommended execution sequence:

1. Build Express health and config only.
2. Add MongoDB connection and model tests.
3. Port simple CRUD routes.
4. Add response-shape snapshots.
5. Port calculations directly and run calculation parity tests.
6. Port projection/scenario/dashboard routes.
7. Seed MongoDB with the demo dataset.
8. Compare route and demo output values.
9. Only then consider frontend rewire or retirement of FastAPI.

## Migration Risk Assessment

| Area | Risk | Reason | Mitigation |
| --- | --- | --- | --- |
| Calculation engine | Critical | Dense recurrence, debt, payoff, transfer, and scenario logic. | Direct port, golden tests, no refactor. |
| Projection engine | Critical | Saved baseline/scenario rows drive dashboard, exports, and validation. | Snapshot FastAPI outputs and compare route responses. |
| Saved projection parity | Critical | Stores assumptions and rows; scenario generation depends on snapshots. | Preserve document shape and overwrite behavior. |
| MongoDB model design | High | ObjectId/reference model can break frontend id assumptions. | Use API adapter exposing `id`; retain `legacyId` during migration. |
| Route migration | Medium | Routes are simple but many contracts are frontend-sensitive. | Route matrix and contract tests. |
| Frontend API rewire | Medium | `Number(id)` assumptions may fail with ObjectId strings. | Preserve numeric legacy ids short-term or isolate rewire phase. |
| Hosting/deployment | Medium | Node + Mongo introduces DB hosting and env management. | Prototype after parity only. |
| Desktop packaging impact | Medium | MongoDB is not lightweight for offline desktop distribution. | Keep desktop choice open. |
| Repository hygiene | Low | Current ignored artifacts are mostly covered by `.gitignore`. | Public release checklist before publishing. |

## Migration Rollback Strategy

FastAPI + SQLite remains the source of truth until Node.js + Express + MongoDB validation passes.

If migration stalls, fails, or introduces regressions:

1. Do not delete FastAPI code.
2. Do not delete SQLite data or seed path.
3. Do not publish the migrated implementation.
4. Restore frontend API base URL to FastAPI.
5. Continue development against the known-good FastAPI implementation.
6. Treat Express/Mongo work as experimental until parity is re-established.

## Hosting Assessment

| Option | Ease | Portfolio Suitability | Cost Sensitivity | MongoDB Support | Maintainability | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Render | High | High | Medium | Use MongoDB Atlas or external Mongo | High | Good portfolio path; easy Node deploys. |
| Railway | High | High | Medium | Native/plugin or Atlas | Medium | Fast iteration, watch usage costs. |
| Fly.io | Medium | High | Medium | External Mongo recommended | Medium | Strong for app hosting, more ops work. |
| Hostinger VPS | Medium | Medium | High | Self-host or Atlas | Medium | More manual setup, lower recurring cost possible. |
| DigitalOcean | Medium | High | Medium | Managed Mongo or self-host | High | Solid long-term option; managed DB costs matter. |
| Vercel frontend + API host | Medium | High | Medium | Atlas | Medium | Split frontend/backend hosting can work for portfolio demos. |

Environment variables likely required:

- `MONGODB_URI`
- `PORT`
- `NODE_ENV`
- `CORS_ORIGINS`
- Optional `VITE_API_BASE_URL` for frontend builds.

No hosting provider should be selected until parity is complete.

## Desktop Packaging Impact Assessment

Electron:

- Easiest path for React + Node.
- Bundling Express is straightforward.
- MongoDB remains the complication. A remote MongoDB works online only; local MongoDB increases install size and complexity.

Tauri:

- Smaller shell, but Node/Express backend integration is less natural.
- A Rust-side or embedded database alternative may become attractive if Tauri is preferred.

Local MongoDB options:

- Full local MongoDB is heavy for end-user distribution.
- Embedded alternatives or SQLite may be more practical for offline desktop use.
- If MongoDB is selected mainly for web deployment, desktop may need a different persistence layer later.

Recommendation:

- Do not let desktop packaging drive this migration yet.
- Preserve a clean backend/data abstraction so persistence can be reconsidered for desktop if needed.

## Public GitHub Impact Assessment

Current tracked source is mostly clean for public planning purposes. The official demo seed is now synthetic and suitable for portfolio use.

Tracked files to review before public release:

- `frontend/qa-screenshots/*.png`: tracked screenshots remain and should be checked for visual quality and absence of personal information.
- `README.md`: should describe demo data and current stack accurately.
- `frontend/.env.example`: should remain example-only.
- `app/seed.py`: should remain synthetic.

Ignored local artifacts already covered by `.gitignore`:

- `*.db`, `*.sqlite`, `*.sqlite3`
- `*.log`, `*.err`, `*.out`, `*.pid`
- `.venv/`
- `frontend/node_modules/`
- `frontend/dist/`
- `.pytest_cache/`

Explicit public release checks:

- Personal data: replaced in seed and local demo dataset; continue checking screenshots and docs.
- Legacy screenshots: Snowball artifacts were previously removed; current tracked screenshots should be reviewed.
- Runtime artifacts: ignored, but do not force-add.
- Log files: ignored.
- Cache files: ignored.
- PID files: ignored.
- Temporary exports: should remain ignored/untracked.
- Abandoned Snowball assets: not present in tracked files.

Clean public history strategy:

- If the repository will be made public with existing history, inspect commit history for personal-data risk.
- If history contains sensitive material, prefer a clean public repository initialized from the sanitized current tree.
- Do not rely on deleting files in a later commit to protect previously committed sensitive data.

## Unresolved Decisions

1. Whether Express responses should expose Mongo ObjectId strings directly or adapt to `id` fields.
2. Whether interest rates should remain a separate collection or be embedded after parity.
3. Whether future desktop packaging requires a different local persistence strategy.
4. Whether the migrated app should keep FastAPI route names exactly or introduce versioned `/api` prefixes.
5. Whether public GitHub release should preserve history or start from a sanitized clean tree.

## Recommended Next Action

Create a small execution SEP for Phase 1 only:

- Express backend skeleton
- Health route
- CORS
- Config loading
- No MongoDB yet
- No calculation port yet
- No frontend rewire yet

Recommended reasoning level: Medium.

Estimated risk: Medium, because it is new infrastructure but not yet connected to production behavior.
