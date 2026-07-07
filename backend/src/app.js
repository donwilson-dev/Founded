const express = require('express');
const cors = require('cors');
const path = require('path');

const { corsOptions } = require('./config/cors');
const { requestLogger } = require('./middleware/requestLogger');
const accountRoutes = require('./routes/accounts');
const dashboardRoutes = require('./routes/dashboard');
const debtRoutes = require('./routes/debts');
const healthRouter = require('./routes/health');
const incomeRoutes = require('./routes/income');
const interestRateRoutes = require('./routes/interestRates');
const projectionRoutes = require('./routes/projections');
const scenarioActionRoutes = require('./routes/scenario');
const scenarioRoutes = require('./routes/scenarios');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

const frontendDistPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
const apiRoutePrefixes = [
  '/health',
  '/account-balances',
  '/dashboard',
  '/debts',
  '/income-sources',
  '/interest-rates',
  '/projections',
  '/scenario',
  '/scenarios',
];

function isApiRoutePath(requestPath) {
  return apiRoutePrefixes.some((prefix) => (
    requestPath === prefix || requestPath.startsWith(`${prefix}/`)
  ));
}

function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '5mb' }));
  app.use(requestLogger);

  app.use('/health', healthRouter);
  app.use('/account-balances', accountRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/debts', debtRoutes);
  app.use('/income-sources', incomeRoutes);
  app.use('/interest-rates', interestRateRoutes);
  app.use('/projections', projectionRoutes);
  app.use('/scenario', scenarioActionRoutes);
  app.use('/scenarios', scenarioRoutes);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(frontendDistPath));
    app.get('*', (req, res, next) => {
      if (isApiRoutePath(req.path) || !req.accepts('html')) {
        next();
        return;
      }

      res.sendFile(path.join(frontendDistPath, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
