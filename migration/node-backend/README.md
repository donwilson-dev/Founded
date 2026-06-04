# Founded Node Backend Migration Workspace

## Current Migration Phase

Phase 3: API Route Contract Scaffold.

This workspace contains only the experimental Node.js / Express infrastructure layer for the Founded migration. It does not contain migrated business logic, projection logic, calculation logic, authentication, exports, reports, or frontend rewiring.

## Current Source of Truth

FastAPI + SQLite remains the authoritative Founded implementation.

The Express backend in this folder is experimental migration infrastructure only. It must be safe to stop or delete without affecting the current FastAPI backend, React frontend, SQLite data, projection calculations, saved projections, dashboard behavior, or existing user workflows.

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

## Remaining Phases

- Future Phase 3+: endpoint-by-endpoint route migration.
- Phase 4: direct JavaScript calculation engine port.
- Phase 5: projection engine port.
- Phase 6: frontend API rewire only if required.
- Phase 7: demo dataset migration.
- Phase 8: migration validation.
- Phase 9: gap remediation.
- Phase 10: release readiness review.

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

MongoDB support is infrastructure-only in this phase.

What exists:

- `mongoose` is installed as the single MongoDB data-access strategy.
- `src/config/database.js` provides optional connect/disconnect helpers.
- `GET /health` reports safe database status.
- `src/models/` contains initial Mongoose schema definitions.

What does not exist:

- No migrated CRUD routes.
- No controllers.
- No business services.
- No calculation logic.
- No projection logic.
- No demo data migration.
- No MongoDB seed process.
- No frontend rewiring.

The models are schema definitions only. They are not connected to routes, they do not contain business logic, and they do not contain calculation logic.

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

## API Contract Scaffold

Phase 3 adds route-group architecture only. The scaffolded route groups return:

```json
{
  "status": "not-implemented",
  "phase": "phase-3-contract-scaffold"
}
```

The placeholder routes do not import Mongoose models, do not query MongoDB, do not implement CRUD, and do not replicate FastAPI behavior. The contract tracker in `API_CONTRACT_MAP.md` is the source document for future endpoint migration status.

## Port Strategy

- FastAPI backend: `8000`
- Express migration backend: `4000`
- Vite frontend: `5173`

The Express migration backend intentionally uses port `4000` so it can run beside FastAPI and Vite without conflict. CORS currently allows:

- `http://127.0.0.1:5173`
- `http://localhost:5173`

CORS origins may be expanded later during frontend rewire or deployment work. The current React frontend remains connected to FastAPI and is not wired to this Express backend.

## Current Limitations

- MongoDB connection is optional and infrastructure-only.
- No migrated FastAPI routes beyond health.
- No calculation engine port.
- No projection engine port.
- No saved projection behavior.
- No dashboard behavior.
- No authentication.
- Not production-ready.

## Future Location Decision

This workspace lives under `migration/node-backend/` temporarily so the Express backend can be developed and validated in isolation.

No final backend folder decision will be made until migration validation is complete. The migrated backend must prove parity with the FastAPI + SQLite implementation before any permanent folder structure decision, source-of-truth switch, or production readiness decision.
