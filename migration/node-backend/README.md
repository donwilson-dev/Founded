# Founded Node Backend Migration Workspace

## Current Migration Phase

Phase 1: Express Backend Skeleton.

This workspace contains only the experimental Node.js / Express infrastructure layer for the Founded migration. It does not contain migrated business logic, projection logic, calculation logic, database models, authentication, exports, reports, or frontend rewiring.

## Current Source of Truth

FastAPI + SQLite remains the authoritative Founded implementation.

The Express backend in this folder is experimental migration infrastructure only. It must be safe to stop or delete without affecting the current FastAPI backend, React frontend, SQLite data, projection calculations, saved projections, dashboard behavior, or existing user workflows.

## Completed Phases

- Phase 1: Express app bootstrap.
- Phase 1: JSON middleware.
- Phase 1: centralized CORS configuration for the current Vite origins.
- Phase 1: health route at `GET /health`.
- Phase 1: safe environment placeholder file.

## Remaining Phases

- Phase 2: MongoDB model and connection planning/execution, after approval.
- Phase 3: route migration.
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
  "phase": "phase-1-skeleton"
}
```

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
      env.js
    middleware/
      requestLogger.js
    routes/
      health.js
```

## Port Strategy

- FastAPI backend: `8000`
- Express migration backend: `4000`
- Vite frontend: `5173`

The Express migration backend intentionally uses port `4000` so it can run beside FastAPI and Vite without conflict. CORS currently allows:

- `http://127.0.0.1:5173`
- `http://localhost:5173`

CORS origins may be expanded later during frontend rewire or deployment work. The current React frontend remains connected to FastAPI and is not wired to this Express backend.

## Current Limitations

- No MongoDB connection.
- No Mongoose or database tooling.
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
