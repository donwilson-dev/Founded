const express = require('express');
const cors = require('cors');

const { corsOptions } = require('./config/cors');
const { requestLogger } = require('./middleware/requestLogger');
const accountRoutes = require('./routes/accounts');
const dashboardRoutes = require('./routes/dashboard');
const debtRoutes = require('./routes/debts');
const healthRouter = require('./routes/health');
const incomeRoutes = require('./routes/income');
const interestRateRoutes = require('./routes/interestRates');
const projectionRoutes = require('./routes/projections');
const scenarioRoutes = require('./routes/scenarios');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(requestLogger);

  app.use('/health', healthRouter);
  app.use('/account-balances', accountRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/debts', debtRoutes);
  app.use('/income-sources', incomeRoutes);
  app.use('/interest-rates', interestRateRoutes);
  app.use('/projections', projectionRoutes);
  app.use('/scenario', scenarioRoutes);
  app.use('/scenarios', scenarioRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
