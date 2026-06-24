# Founded Node Backend

This folder contains the active Node.js / Express backend for Founded. It serves the React/Vite frontend and persists application data in MongoDB Community Server.

## Runtime

- Node.js
- Express
- MongoDB Community Server
- Mongoose

MongoDB is the authoritative Founded data source. Baseline, scenario, dashboard, account projection, payoff, recurrence, and primitive calculations run through native Node services in `src/services`.

## Startup

Install dependencies from this folder:

```powershell
cd migration\node-backend
npm install
```

Run the backend with the watcher:

```powershell
npm run dev
```

Or run without the watcher:

```powershell
npm start
```

## Configuration

Create a local environment file in this folder:

```powershell
Copy-Item .env.example .env
```

Set the local MongoDB URI:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/founded_migration
```

The `.env` file is ignored by git and must stay local. Do not commit connection strings, credentials, or local environment files.

## Health Check

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
```

When MongoDB is reachable, the health response reports `database: "connected"`. With `MONGODB_URI` unset, the server still starts and reports `database: "not-configured"`.

## Validation

```powershell
npm test
npm run dataset:verify
```

## Dataset Utilities

The dataset verification script validates the synthetic demonstration dataset used by current development and visual validation workflows.

```powershell
npm run dataset:verify
```

## Folder Structure

```text
migration/node-backend/
  .env.example
  README.md
  package.json
  server.js
  scripts/
    datasetV1.js
    verifyDataset.js
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
      scenario.js
      scenarios.js
    controllers/
      AccountController.js
      DashboardController.js
      DebtController.js
      IncomeController.js
      InterestRateController.js
      ProjectionController.js
      ScenarioController.js
    services/
      calculations/
```

## Current Limitations

- No authentication.
- Not yet production-packaged.
