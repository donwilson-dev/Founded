const express = require('express');
const cors = require('cors');

const { corsOptions } = require('./config/cors');
const { requestLogger } = require('./middleware/requestLogger');
const healthRouter = require('./routes/health');

function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(requestLogger);

  app.use('/health', healthRouter);

  return app;
}

module.exports = { createApp };
