# Founded Node Backend Migration Workspace

## Current Migration Phase

Phase 14: FastAPI calculation bridge retired.

This workspace contains the Node.js / Express backend used for the Founded migration. Baseline, scenario, and dashboard calculation routes now execute through native Node services backed by MongoDB.

## Current Source of Truth

MongoDB is the authoritative Founded data source for the migrated backend.

The former FastAPI calculation bridge has been retired from active Node execution paths. FastAPI application files may still exist outside this backend as historical/reference artifacts, but calculation routes in this backend no longer depend on FastAPI.

## Completed Phases

- Phase 1: Express app bootstrap.
- Phase 1: JSON middleware.
- Phase 1: centralized CORS configuration for the current Vite origins.
- Phase 1: health route at `GET /health`.
- Phase 1: safe environment placeholder file.
- Phase 2: Mongoose dependency installed.
- Phase 2: optional MongoDB connection helper.
- Phase 2: safe database status reporting in `GET /health`.
- Phase 2: initial schema-only Mongoose models.
- Phase 2: model mapping documentation.
- Phase 3: API route groups registered as placeholders.
- Phase 3: controller placeholder files.
- Phase 3: generic not-found and error middleware.
- Phase 3: API contract migration tracker in `API_CONTRACT_MAP.md`.
- Phase 4: GET-only account balance retrieval framework.
- Phase 4: GET-only income source retrieval framework.
- Phase 4: GET-only debt retrieval framework.
- Phase 4: GET-only interest-rate retrieval framework.
- Phase 4: data availability states documented and handled.

## Remaining Phases

- Native-only visual verification.
- Migration completion review.
- Production packaging and deployment planning.

## Startup

Install dependencies from this folder:

```powershell
cd migration\node-backend
npm install
```

Run the migration backend:

```powershell
npm run dev
```

Or run without the watcher:

```powershell
npm start
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "founded-node-backend",
  "phase": "phase-2-mongodb",
  "database": "not-configured"
}
```

If `MONGODB_URI` is configured and reachable, `database` reports `connected`. If `MONGODB_URI` is blank, the server still starts and reports `not-configured`. Connection strings and credentials are never returned by the health route.

## MongoDB Integration Status

MongoDB is the active data-access layer for the migrated backend.

What exists:

- `mongoose` is installed as the single MongoDB data-access strategy.
- `src/config/database.js` provides optional connect/disconnect helpers.
- `GET /health` reports safe database status.
- `src/models/` contains Mongoose schema definitions for migrated records.
- `src/controllers/` and `src/routes/` expose migrated CRUD, projection, scenario, and dashboard routes.
- `src/services/calculations/` contains native calculation services for baseline, scenario, dashboard, account projection, payoff metrics, recurrence, and primitives.

What remains out of scope:

- Authentication.
- Production packaging.
- Deployment-specific configuration.

FastAPI parity references in tests and audit documents are retained as historical validation context.

## Local MongoDB Community Server Validation Setup

Phase 14 uses local MongoDB Community Server as the authoritative migrated datastore for validation.

Observed local validation environment:

- Deployment method: MongoDB Community Server.
- MongoDB version: `8.3.2`.
- Windows service name: `MongoDB`.
- Service display name: `MongoDB Server (MongoDB)`.
- Process name: `mongod.exe`.
- Installed binary: `C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe`.
- Host/port: `127.0.0.1:27017`.
- Database name: `founded_migration`.
- Connection URI pattern: `mongodb://127.0.0.1:27017/founded_migration`.

Create a local environment file in this folder:

```powershell
cd migration\node-backend
Copy-Item .env.example .env
```

Set the local MongoDB URI:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/founded_migration
```

The `.env` file is ignored by git and must stay local. Do not commit connection strings, credentials, or local environment files.

Verify the MongoDB Windows service:

```powershell
Get-Service -Name MongoDB
```

Start the service from an elevated PowerShell session if it is not already running:

```powershell
Start-Service -Name MongoDB
```

Verify the local port:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 27017
```

Then start the migration backend from this folder:

```powershell
npm run dev
```

With `MONGODB_URI` unset, `GET /health` reports `database: "not-configured"`. With MongoDB Community Server running and the `.env` value above, `GET /health` reports `database: "connected"`.

If service control is unavailable in the current shell, the installed Community Server binary can still be used for local validation with a writable local data/log path. This is a local development fallback only; it does not change the application source of truth or import data.

Dataset protection rules for Phase 8A:

- Do not run a dataset import.
- Do not seed or populate collections.
- Validation collections may be absent or empty.
- Expected local collection counts for this phase are `0` when collections exist.
- Phase 8 dataset import remains deferred until separately approved.

## Model Mapping

The model mapping follows `docs/node-express-mongodb-migration-plan.md` and favors parity with the current FastAPI + SQLite concepts.

| Collection | Source SQLite / FastAPI Entity | Mongoose Model | Relationship Approach | Parity Notes |
| --- | --- | --- | --- | --- |
| `accountBalances` | `AccountBalance` / `account_balances` | `Account` | Referenced by income, transfer, and debt records. | Keeps account owner/type fields and `legacyId` for validation mapping. |
| `incomeSources` | `IncomeSource` / `income_sources` | `Income` | References account, from account, and to account by ObjectId, with legacy id fields for parity validation. | Account transfers remain income-source records with `is_account_transfer`. |
| `debts` | `Debt` / `debts` | `Debt` | References account by ObjectId, with legacy id field for parity validation. Interest rates remain separate for first-pass API parity. | Preserves debt type, recurrence, payment, balance, priority, due-day, and active fields. |
| `interestRates` | `InterestRate` / `interest_rates` | `InterestRate` | References a debt by ObjectId, with `legacy_debt_id` for validation mapping. | Separate collection is intentionally used first for route-contract parity. |
| `savedProjections` | `SavedProjection` / `saved_projections` | `SavedProjection` | Stores generated rows and assumption snapshots in the document. | Preserves baseline/scenario projection type and overwrite-by-title index shape. |
| `savedProjections` | Scenario projections saved through `SavedProjection` | `Scenario` | Uses the same collection as saved projections. | Scenario is a schema-only convenience model for scenario documents; no separate scenario collection is introduced. |

Known migration risks:

- MongoDB ObjectIds may not be drop-in replacements for current numeric ids. API adapters should expose compatible `id` values during route migration.
- Saved projections can become large documents because they contain generated rows and snapshots. This is acceptable for current 60-300 month ranges, but BSON size should be monitored in later phases.
- Interest rates are intentionally a separate collection for first-pass route parity. Embedding can be reassessed only after migration validation.
- Scenario documents remain saved projections to preserve current application behavior.

Parity notes:

- Date fields are modeled as API-boundary strings so existing `YYYY-MM-DD` semantics can be preserved during route migration.
- `legacyId` and related legacy foreign-key fields exist only to support migration validation. They are not active application behavior.
- Unique saved projection indexing mirrors overwrite-by-title-and-type behavior conceptually, but no save route uses it yet.

## Folder Structure

```text
migration/node-backend/
  .env.example
  README.md
  package.json
  server.js
  src/
    app.js
    config/
      cors.js
      database.js
      env.js
    middleware/
      errorHandler.js
      notFound.js
      requestLogger.js
    models/
      Account.js
      Debt.js
      Income.js
      InterestRate.js
      SavedProjection.js
      Scenario.js
      index.js
    routes/
      accounts.js
      dashboard.js
      debts.js
      health.js
      income.js
      interestRates.js
      projections.js
      scenarios.js
    controllers/
      AccountController.js
      DashboardController.js
      DebtController.js
      IncomeController.js
      InterestRateController.js
      ProjectionController.js
      ScenarioController.js
```

## API Contract Scaffold And Read-Only Framework

Phase 3 added route-group architecture only. Deferred scaffolded route groups return:

```json
{
  "status": "not-implemented",
  "phase": "phase-3-contract-scaffold"
}
```

Phase 4 connects GET-only retrieval routes for:

- `GET /account-balances`
- `GET /account-balances/:id`
- `GET /income-sources`
- `GET /income-sources/:id`
- `GET /debts`
- `GET /debts/:id`
- `GET /interest-rates/debt/:debtId`

These routes call Mongoose models only when MongoDB is connected. If MongoDB is not configured or unavailable, the routes return safe database status and do not crash.

No POST, PUT, PATCH, or DELETE routes are implemented for these groups. Projections, scenarios, and dashboard remain scaffold-only and deferred. The contract tracker in `API_CONTRACT_MAP.md` is the source document for future endpoint migration status.

## Data Availability States

| State | Condition | Behavior |
| --- | --- | --- |
| A | MongoDB not configured | GET routes return `503` with `database: "not-configured"`. |
| B | MongoDB configured but empty | List routes return `[]`; item routes return `404` for missing documents. |
| C | MongoDB configured with data | GET routes return available MongoDB records without claiming data parity. |

Data parity is not claimed in Phase 4 because MongoDB seed/import work has not happened.

## Migration Dataset Framework

Phase 5 establishes Dataset Version 1.0 as the canonical MongoDB migration dataset definition. The dataset audit lives in `MIGRATION_DATASET_AUDIT.md`.

Dataset tooling:

```powershell
npm run dataset:preview
npm run dataset:verify
npm run dataset:import
```

Current behavior:

- `dataset:preview` prints Dataset Version 1.0 counts, target collections, relationship counts, and validation anchors.
- `dataset:verify` checks MongoDB counts and relationships when `MONGODB_URI` is configured. Without MongoDB, it reports verification as deferred.
- `dataset:import` is intentionally deferred and performs no writes in Phase 5.

The canonical dataset is based on the approved synthetic demo dataset and migration reference values, not on mutable local SQLite contents.

## Port Strategy

- Node backend: `4000`
- Vite frontend: `5173`
- Native visual verification frontend: `5174`

The Node backend uses port `4000`. CORS currently allows:

- `http://127.0.0.1:5173`
- `http://localhost:5173`
- `http://127.0.0.1:5174`
- `http://localhost:5174`

CORS origins may be expanded later during deployment work.

## Current Limitations

- No authentication.
- Not yet production-packaged.

## Future Location Decision

This workspace lives under `migration/node-backend/` temporarily so the Express backend can be developed and validated in isolation.

No final backend folder decision will be made until migration validation is complete. The migrated backend must prove parity with the FastAPI + SQLite implementation before any permanent folder structure decision, source-of-truth switch, or production readiness decision.
